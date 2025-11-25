
import { PricingPlan, Transaction, UserStatus, UsageLog } from "../types";
import { supabase } from "./supabaseClient";

// Helper function for retrying operations
const withRetry = async <T>(operation: () => PromiseLike<T>, maxRetries: number = 3, delayMs: number = 1000): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            
            let msg = '';
            if (typeof error === 'string') msg = error;
            else if (error instanceof Error) msg = error.message;
            else if (typeof error === 'object') {
                try {
                    msg = JSON.stringify(error);
                } catch (e) {
                    msg = 'Unknown error object';
                }
            }
            
            const isRetryable = 
                msg.includes('Failed to fetch') || 
                msg.includes('NetworkError') || 
                msg.includes('network') || 
                msg.includes('503') || 
                msg.includes('504') || 
                msg.includes('502') ||
                msg.includes('500') ||
                msg.includes('TypeError: Failed to fetch') ||
                msg.includes('upstream connect error');

            if (i < maxRetries - 1 && isRetryable) {
                const backoff = delayMs * Math.pow(2.5, i);
                console.warn(`[PaymentService] Lỗi mạng (lần ${i + 1}/${maxRetries}). Thử lại sau ${Math.round(backoff)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
            } else {
                throw error;
            }
        }
    }
    throw lastError;
};

export interface PendingTransactionResult {
    transactionId: string;
    transactionCode: string;
    amount: number;
}

// --- 1. Verify Voucher from DB ---
export const checkVoucher = async (code: string): Promise<number> => {
    try {
        const { data, error } = await supabase
            .from('coupons')
            .select('discount_percent')
            .eq('code', code.toUpperCase())
            .eq('is_active', true)
            .single();

        if (error || !data) {
            throw new Error("Mã giảm giá không tồn tại hoặc đã hết hạn.");
        }
        return data.discount_percent;
    } catch (e: any) {
        throw e;
    }
};

// --- 2. Create Pending Transaction (For SePay) ---
export const createPendingTransaction = async (
    userId: string,
    plan: PricingPlan,
    finalAmount: number // Amount after discount
): Promise<PendingTransactionResult> => {
    return withRetry(async () => {
        // Call the DB function to insert transaction with 'pending' status
        const { data, error } = await supabase.rpc('create_pending_transaction', {
            p_user_id: userId,
            p_plan_id: plan.id,
            p_amount: finalAmount,
            p_plan_name: plan.name,
            p_plan_credits: plan.credits || 0,
            p_payment_method: 'qr'
        });

        if (error) throw error;
        
        return {
            transactionId: data.transactionId,
            transactionCode: data.transactionCode,
            amount: finalAmount
        };
    });
};

// --- 3. Listen for SePay success (Realtime) ---
export const subscribeToTransaction = (transactionId: string, onCompleted: () => void) => {
    const channel = supabase
        .channel(`tx_${transactionId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'transactions',
                filter: `id=eq.${transactionId}`,
            },
            (payload) => {
                const newStatus = payload.new.status;
                if (newStatus === 'completed') {
                    onCompleted();
                }
            }
        )
        .subscribe();

    // Return unsubscribe function
    return () => {
        supabase.removeChannel(channel);
    };
};

// --- User Status & History (Existing functions) ---

export const getUserStatus = async (userId: string, userEmail?: string): Promise<UserStatus> => {
    return withRetry(async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('credits, subscription_end')
            .eq('id', userId)
            .single();

        if (error) {
            // If profile doesn't exist, create one
            if (error.code === 'PGRST116') {
                const { error: insertError } = await supabase
                    .from('profiles')
                    .insert([{ id: userId, email: userEmail, credits: 60 }]); // Default 60 credits
                
                if (!insertError) {
                    return { credits: 60, subscriptionEnd: null, isExpired: false };
                }
            }
            console.error("Error fetching user status:", error);
            return { credits: 0, subscriptionEnd: null, isExpired: true };
        }

        const isExpired = data.subscription_end ? new Date(data.subscription_end) < new Date() : false;
        return {
            credits: data.credits || 0,
            subscriptionEnd: data.subscription_end,
            isExpired
        };
    });
};

export const deductCredits = async (userId: string, amount: number, description: string): Promise<string> => {
    return withRetry(async () => {
        // 1. Check balance
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single();

        if (profileError || !profile) throw new Error("Không thể lấy thông tin tài khoản.");
        if (profile.credits < amount) throw new Error(`Không đủ credits. Cần ${amount}, hiện có ${profile.credits}.`);

        // 2. Deduct
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits: profile.credits - amount })
            .eq('id', userId);

        if (updateError) throw new Error("Lỗi khi trừ credits.");

        // 3. Log usage
        const { data: logData, error: logError } = await supabase
            .from('usage_logs')
            .insert([{
                user_id: userId,
                credits_used: amount,
                description: description
            }])
            .select('id')
            .single();
            
        if (logError) console.error("Failed to log usage", logError);
        
        return logData ? logData.id : 'unknown_log_id';
    });
};

export const refundCredits = async (userId: string, amount: number, description: string) => {
    try {
        // Get current
        const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single();
        if (!profile) return;

        // Refund
        await supabase.from('profiles').update({ credits: profile.credits + amount }).eq('id', userId);

        // Log refund
        await supabase.from('usage_logs').insert([{
            user_id: userId,
            credits_used: -amount, // Negative for refund
            description: description
        }]);
    } catch (e) {
        console.error("Refund failed:", e);
    }
};

export const getTransactionHistory = async (): Promise<Transaction[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) return [];
    return data as Transaction[];
};

export const redeemGiftCode = async (userId: string, code: string): Promise<number> => {
    return withRetry(async () => {
        const { data, error } = await supabase.rpc('redeem_gift_code', {
            p_user_id: userId,
            p_code: code.toUpperCase()
        });

        if (error) throw new Error(error.message);
        return data; // Returns amount of credits added
    });
};

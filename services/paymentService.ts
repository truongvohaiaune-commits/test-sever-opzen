
import { PricingPlan, Transaction, UserStatus, UsageLog } from "../types";
import { supabase } from "./supabaseClient";

// Mock API response delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function for retrying operations
const withRetry = async <T>(operation: () => PromiseLike<T>, maxRetries: number = 3, delayMs: number = 1000): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            
            // Extract error message string safely to check for retryable conditions
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
                console.warn(`[PaymentService] Lỗi mạng (lần ${i + 1}/${maxRetries}). Database có thể đang khởi động. Thử lại sau ${Math.round(backoff)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
            } else {
                throw error;
            }
        }
    }
    throw lastError;
};

export interface PaymentResult {
    success: boolean;
    message: string;
    transactionId?: string;
}

// --- NEW: Verify Voucher from DB ---
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
        throw e; // Propagate error to UI
    }
};

export const processPayment = async (
    userId: string, 
    plan: PricingPlan, 
    paymentMethod: 'qr' | 'card',
    voucherCode?: string
): Promise<PaymentResult> => {
    // --- SECURE FLOW: Call Database RPC ---
    // Logic tính toán giá và cộng credits nằm hoàn toàn ở Server (SQL Function).
    // Frontend chỉ gửi ID gói và Mã Voucher.
    try {
        const { data, error } = await supabase.rpc('process_payment_secure', {
            p_user_id: userId,
            p_plan_id: plan.id,
            p_payment_method: paymentMethod,
            p_voucher_code: voucherCode || null,
            // Các tham số dưới đây được giữ lại để tương thích ngược nếu SQL chưa update, 
            // nhưng SQL chuẩn nên ignore chúng và tự lookup từ bảng 'plans'.
            p_plan_name: plan.name,
            p_plan_price: plan.price, 
            p_plan_credits: plan.credits || 0,
            p_duration_months: plan.durationMonths || 1
        });

        if (error) throw error;
        
        if (data && data.success === false) {
            throw new Error(data.message);
        }

        return {
            success: true,
            message: data.message,
            transactionId: data.transactionId
        };

    } catch (rpcError: any) {
        console.error("[PaymentService] Secure Payment Failed:", rpcError);
        throw new Error(rpcError.message || "Giao dịch thất bại. Vui lòng thử lại.");
    }
};

export const getTransactionHistory = async (): Promise<Transaction[]> => {
    try {
        const { data, error } = await withRetry<{ data: any[] | null, error: any }>(() => supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false }));

        if (error) throw error;
        return data as Transaction[];
    } catch (e) {
        console.error("Failed to load history:", e);
        return [];
    }
};

export const getUserStatus = async (userId: string, email?: string): Promise<UserStatus> => {
    try {
        const { data: profile } = await withRetry<{ data: { credits: number, subscription_end: string | null, email?: string } | null }>(() => supabase
            .from('profiles')
            .select('credits, subscription_end, email')
            .eq('id', userId)
            .maybeSingle());

        if (profile) {
            // 1. Sync Email if missing
            if (email && !profile.email) {
                await supabase.from('profiles')
                    .update({ email, updated_at: new Date().toISOString() })
                    .eq('id', userId);
            }

            // 2. Check Expiration
            const now = new Date();
            const subEnd = profile.subscription_end ? new Date(profile.subscription_end) : null;
            const isExpired = subEnd ? subEnd < now : true;

            if (isExpired && profile.credits > 0) {
                return { credits: profile.credits, subscriptionEnd: profile.subscription_end, isExpired: true };
            }

            return { credits: profile.credits, subscriptionEnd: profile.subscription_end, isExpired: isExpired };
        } else {
            // NEW USER INITIALIZATION
            const now = new Date();
            const oneMonthLater = new Date(now.setMonth(now.getMonth() + 1));
            const initialCredits = 60;

            const { error } = await withRetry<{ error: any }>(() => supabase.from('profiles').upsert({
                id: userId,
                email: email, 
                credits: initialCredits,
                subscription_end: oneMonthLater.toISOString()
            }, { onConflict: 'id' }));
            
            if (!error) {
                return { credits: initialCredits, subscriptionEnd: oneMonthLater.toISOString(), isExpired: false };
            }
        }
    } catch (e) {
        console.warn("Error getting user status:", e);
    }
    return { credits: 0, subscriptionEnd: null, isExpired: true };
};

export const deductCredits = async (userId: string, amount: number, description: string = 'Sử dụng tính năng AI'): Promise<string> => {
    try {
        return await withRetry(async () => {
            // 1. Check Balance
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('credits, subscription_end')
                .eq('id', userId)
                .single();
                
            if (fetchError) throw new Error(`Lỗi kiểm tra số dư.`);

            // Validate Expiration
            const now = new Date();
            const subEnd = profile.subscription_end ? new Date(profile.subscription_end) : null;
            if (!subEnd || subEnd < now) {
                 throw new Error("Gói cước của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.");
            }

            const currentCredits = profile?.credits ?? 0;
            if (currentCredits < amount) {
                throw new Error(`Không đủ Credits. Cần ${amount}, hiện có ${currentCredits}.`);
            }

            // 2. Record Usage Log
            const { data: logData, error: logError } = await supabase
                .from('usage_logs')
                .insert({
                    user_id: userId,
                    credits_used: amount,
                    description: description,
                })
                .select('id')
                .single();

            if (logError) throw new Error(`Lỗi ghi nhật ký giao dịch.`);

            // 3. Update Balance
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    credits: currentCredits - amount,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (updateError) throw new Error(`Lỗi trừ tiền trong tài khoản.`);

            return logData.id;
        }, 3, 1000);

    } catch (error: any) {
        console.error("Deduct credits failed:", error);
        let uiMessage = error.message || "Lỗi hệ thống.";
        if (uiMessage.includes('Failed to fetch')) {
            throw new Error("Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.");
        }
        throw new Error(uiMessage);
    }
};

export const refundCredits = async (userId: string, amount: number, description: string = 'Hoàn tiền'): Promise<void> => {
    try {
        await withRetry(async () => {
            const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single();
            if (!profile) return;

            await supabase.from('profiles').update({ 
                credits: profile.credits + amount, 
                updated_at: new Date().toISOString() 
            }).eq('id', userId);

            await supabase.from('usage_logs').insert({
                user_id: userId,
                credits_used: -amount,
                description: description,
            });
        });
    } catch (e) {
        console.error("Refund failed:", e);
    }
};

export const redeemGiftCode = async (userId: string, code: string): Promise<number> => {
    const cleanCode = code.trim().toUpperCase();
    
    const { data: giftCode, error: codeError } = await supabase
        .from('gift_codes')
        .select('*')
        .eq('code', cleanCode)
        .eq('is_active', true)
        .single();

    if (codeError || !giftCode) throw new Error('Mã quà tặng không hợp lệ hoặc không tồn tại.');
    if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) throw new Error('Mã quà tặng đã hết hạn.');

    const { data: usage } = await supabase
        .from('gift_code_usages')
        .select('id')
        .eq('user_id', userId)
        .eq('code_id', giftCode.id)
        .maybeSingle();

    if (usage) throw new Error('Bạn đã sử dụng mã quà tặng này rồi.');

    const { error: usageError } = await supabase.from('gift_code_usages').insert({ user_id: userId, code_id: giftCode.id });
    if (usageError) {
        if (usageError.code === '23505') throw new Error('Bạn đã sử dụng mã quà tặng này rồi.');
        throw new Error('Lỗi hệ thống khi áp dụng mã.');
    }

    const { data: profile } = await supabase.from('profiles').select('credits, subscription_end').eq('id', userId).single();
    
    const currentCredits = profile?.credits || 0;
    const newCredits = currentCredits + giftCode.credits;
    let newSubscriptionEnd = profile?.subscription_end;
    
    const durationDays = (giftCode as any).duration_days;
    if (durationDays && durationDays > 0) {
        const now = new Date();
        const potentialNewExpiry = new Date(now);
        potentialNewExpiry.setDate(potentialNewExpiry.getDate() + durationDays);
        
        const currentExpiry = profile?.subscription_end ? new Date(profile.subscription_end) : null;
        
        if (!currentExpiry || currentExpiry < now) {
            newSubscriptionEnd = potentialNewExpiry.toISOString();
        } else {
            if (potentialNewExpiry > currentExpiry) {
                newSubscriptionEnd = potentialNewExpiry.toISOString();
            } else {
                newSubscriptionEnd = currentExpiry.toISOString();
            }
        }
    }

    const updatePayload: any = { credits: newCredits, updated_at: new Date().toISOString() };
    if (newSubscriptionEnd) updatePayload.subscription_end = newSubscriptionEnd;

    await supabase.from('profiles').update(updatePayload).eq('id', userId);

    await supabase.from('transactions').insert({
        user_id: userId,
        plan_name: `Giftcode: ${cleanCode}`,
        plan_id: 'gift_redemption',
        amount: 0,
        currency: 'VND',
        type: 'credit',
        credits_added: giftCode.credits,
        status: 'completed',
        payment_method: 'giftcode',
        transaction_code: cleanCode
    });

    return giftCode.credits;
};

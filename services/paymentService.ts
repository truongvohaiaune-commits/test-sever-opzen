
import { supabase } from './supabaseClient';
import { PricingPlan, UserStatus, Transaction } from '../types';

export const getUserStatus = async (userId: string, email?: string): Promise<UserStatus> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('credits, subscription_end')
            .eq('id', userId)
            .single();

        if (error) {
            // Handle profile not found - auto create if needed or return default
            if (error.code === 'PGRST116' && email) {
                 // Create profile if it doesn't exist
                 const { error: insertError } = await supabase
                    .from('profiles')
                    .insert([{ id: userId, email, credits: 60 }]); // Free trial credits
                 
                 if (!insertError) {
                     return { credits: 60, subscriptionEnd: null, isExpired: false };
                 }
            }
            
            console.error("Error fetching user status:", error);
            return { credits: 0, subscriptionEnd: null, isExpired: false };
        }

        const credits = data?.credits ?? 0;
        const subscriptionEnd = data?.subscription_end;
        const isExpired = subscriptionEnd ? new Date(subscriptionEnd) < new Date() : false;

        return {
            credits,
            subscriptionEnd,
            isExpired
        };
    } catch (e) {
        console.error("Exception in getUserStatus:", e);
        return { credits: 0, subscriptionEnd: null, isExpired: false };
    }
};

export const deductCredits = async (userId: string, amount: number, description: string): Promise<string> => {
    // Attempt to use RPC for atomic transaction
    const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) {
        console.error("deductCredits error:", error);
        
        // Fallback: Check balance and insert log manually (NOT ATOMIC)
        // This is a backup in case RPC is not set up on the DB yet.
        const status = await getUserStatus(userId);
        if (status.credits < amount) {
            throw new Error(`Không đủ credits. Bạn có ${status.credits}, cần ${amount}.`);
        }
        
        // Manual update (Risky without transaction)
        const { data: logData, error: logError } = await supabase
            .from('usage_logs')
            .insert({ user_id: userId, credits_used: amount, description })
            .select('id')
            .single();
            
        if (logError) throw new Error("Ghi nhật ký sử dụng thất bại.");
        
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ credits: status.credits - amount })
            .eq('id', userId);
            
        if (updateError) {
             console.error("Critical: Failed to update profile credits after logging usage.");
        }
        
        return logData.id;
    }

    return data; // Returns log ID
};

export const refundCredits = async (userId: string, amount: number, description: string): Promise<void> => {
    const { error } = await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description
    });

    if (error) {
        console.error("refundCredits error:", error);
        // Manual fallback: update credits
        const status = await getUserStatus(userId);
        await supabase.from('profiles').update({ credits: status.credits + amount }).eq('id', userId);
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

    if (error) {
        console.error("getTransactionHistory error:", error);
        return [];
    }

    return data as Transaction[];
};

export const redeemGiftCode = async (userId: string, code: string): Promise<number> => {
    const { data, error } = await supabase.rpc('redeem_giftcode', {
        p_user_id: userId,
        p_code: code
    });

    if (error) {
        throw new Error(error.message);
    }

    return data; // returns amount added
};

export const createPendingTransaction = async (userId: string, plan: PricingPlan, amount: number) => {
    // 1. Tìm giao dịch đang pending cũ của User cho gói này
    const { data: existingTx } = await supabase
        .from('transactions')
        .select('id, transaction_code, amount, created_at')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingTx) {
        // [UPDATE] Kiểm tra tiền tố để đảm bảo đồng bộ (OPZ)
        // Nếu mã cũ là PAY... thì coi như không hợp lệ và tạo mới
        const isCorrectPrefix = existingTx.transaction_code.startsWith('OPZ');

        // Nếu số tiền khớp hoàn toàn VÀ đúng tiền tố -> Tái sử dụng (Idempotency)
        if (existingTx.amount === amount && isCorrectPrefix) {
            console.log(`[Payment] Reusing existing pending transaction: ${existingTx.transaction_code}`);
            return {
                transactionId: existingTx.id,
                transactionCode: existingTx.transaction_code,
                amount: existingTx.amount
            };
        }

        // Nếu số tiền KHÁC (do áp dụng/xóa voucher) HOẶC Tiền tố cũ (PAY...) -> HỦY cái cũ để tạo cái mới
        console.log(`[Payment] Refreshing transaction (Amount changed or Old Prefix). Cancelling old tx ${existingTx.transaction_code}...`);
        await supabase
            .from('transactions')
            .update({ status: 'cancelled' })
            .eq('id', existingTx.id);
    }

    // 2. Dọn dẹp các giao dịch 'pending' khác của user (nếu họ nhảy qua nhảy lại giữa các gói)
    // Chỉ giữ lại 1 giao dịch pending duy nhất tại một thời điểm
    await supabase
        .from('transactions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'pending');

    // 3. Tạo giao dịch MỚI với Mã mới chuẩn OPZ...
    const transactionCode = `OPZ${Math.floor(100000 + Math.random() * 900000)}`;
    
    const { data, error } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            plan_id: plan.id,
            plan_name: plan.name,
            amount: amount,
            currency: plan.currency,
            type: plan.type,
            credits_added: plan.credits || 0,
            status: 'pending',
            payment_method: 'bank_transfer',
            transaction_code: transactionCode
        })
        .select('id, transaction_code, amount')
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return {
        transactionId: data.id,
        transactionCode: data.transaction_code,
        amount: data.amount
    };
};

export const subscribeToTransaction = (transactionId: string, onPaid: () => void) => {
    const channel = supabase
        .channel(`tx-${transactionId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'transactions',
                filter: `id=eq.${transactionId}`
            },
            (payload) => {
                if (payload.new.status === 'completed') {
                    onPaid();
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const checkVoucher = async (code: string): Promise<number> => {
    // --- REAL DATABASE CHECK ---
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('discount_percent, is_active, start_date, end_date')
            .eq('code', code)
            .single();

        if (error) {
            // Nếu lỗi là do bảng chưa tồn tại (thường gặp khi mới setup), ta throw lỗi rõ ràng
            if (error.code === '42P01') {
                throw new Error("Hệ thống mã giảm giá đang bảo trì (Table missing). Vui lòng thử mã TEST10.");
            }
            // Mã không tìm thấy
            if (error.code === 'PGRST116') {
                throw new Error("Mã giảm giá không hợp lệ.");
            }
            throw new Error(error.message);
        }
        
        if (!data.is_active) {
            throw new Error("Mã giảm giá đã hết hạn hoặc bị vô hiệu hóa.");
        }
        
        // Check dates if applicable
        const now = new Date();
        if (data.start_date && new Date(data.start_date) > now) throw new Error("Mã chưa có hiệu lực.");
        if (data.end_date && new Date(data.end_date) < now) throw new Error("Mã đã hết hạn.");

        return data.discount_percent;
    } catch (e: any) {
        // Fallback for hardcoded test codes if DB fails or empty
        const hardcoded: Record<string, number> = {
            'TEST10': 10,
            'OPZEN20': 20,
            'FREE100': 100
        };
        if (hardcoded[code]) return hardcoded[code];
        
        throw e;
    }
};

// --- DEV TOOL: Simulate Webhook (Backend Logic) ---
export const simulateSePayWebhook = async (transactionId: string): Promise<boolean> => {
    if (transactionId.startsWith('mock-tx-')) {
        console.warn("Cannot simulate backend webhook on a mock transaction ID (DB record does not exist).");
        return true;
    }

    try {
        console.log(`[DevTool] Simulating webhook for ${transactionId}...`);
        
        // Gọi RPC (Stored Procedure) đã tạo trong Supabase để bypass RLS
        const { data, error } = await supabase.rpc('approve_transaction_test', {
            p_transaction_id: transactionId
        });

        if (error) {
            console.error("[DevTool] RPC Error:", error);
            throw new Error(error.message);
        }

        if (data === true) {
            console.log("[DevTool] Webhook simulated successfully via RPC.");
            return true;
        } else {
            console.warn("[DevTool] RPC returned false (Transaction not found or already completed).");
            return false;
        }

    } catch (e) {
        console.error("[DevTool] Failed to simulate webhook:", e);
        return false;
    }
};

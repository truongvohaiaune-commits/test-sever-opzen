
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mtlomjjlgvsjpudxlspq.supabase.co';

// =================================================================================
// == QUAN TRỌNG: DÁN KHÓA "ANON (PUBLIC)" CỦA BẠN VÀO ĐÂY ĐỂ KÍCH HOẠT ĐĂNG NHẬP ==
// =================================================================================
// Lấy khóa từ: Project Settings > API > Project API Keys > anon / public
// Note: Trim whitespace just in case of copy-paste errors
const rawKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bG9tampsZ3ZzanB1ZHhsc3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzAwMjcsImV4cCI6MjA3ODkwNjAyN30.6K-rSAFVJxQPLVjZKdJpBspb5tHE1dZiry4lS6u6JzQ";
const supabaseKey = rawKey ? rawKey.trim() : "";
// =================================================================================

// Custom fetch with safe timeout implementation
const fetchWithTimeout = (url: any, options: any) => {
    const TIMEOUT_MS = 20000; // 20 seconds to handle cold starts

    // 1. Try modern AbortSignal.timeout if available
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        try {
            // @ts-ignore
            return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
        } catch (e) {
            // Fallback if this specific call fails
        }
    }

    // 2. Fallback to AbortController
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

    return fetch(url, { ...options, signal: controller.signal })
        .then(response => {
            clearTimeout(id);
            return response;
        })
        .catch(error => {
            clearTimeout(id);
            throw error;
        });
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
    // Increase global timeout for slower networks or paused projects
    global: {
        fetch: fetchWithTimeout
    }
});

// Biến này giúp giao diện kiểm tra xem khóa đã được cấu hình hay chưa.
export const isSupabaseConfigured = supabaseKey && !supabaseKey.startsWith("DÁN_KHÓA") && supabaseKey.length > 20;

// Function to explicitly check connection (useful for debugging)
export const checkSupabaseConnection = async () => {
    if (!isSupabaseConfigured) {
        console.error("[Supabase] Key is missing or invalid.");
        return false;
    }
    
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const start = Date.now();
            // Using 'head: true' is lighter/faster
            const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
            
            if (!error) {
                console.log(`[Supabase] Connection OK (${Date.now() - start}ms).`);
                return true;
            }
            
            // If we get a database error (like table not found), the connection itself IS working (we reached the server).
            // "Failed to fetch" is the main network error we want to retry.
            const msg = error.message || '';
            if (!msg.includes('fetch') && !msg.includes('Network')) {
                 // If it's just a schema error (e.g. table doesn't exist yet), treating as Connected for network purposes
                 console.warn(`[Supabase] Connected, but returned DB error: ${msg}`);
                 return true;
            }
            
            throw error; // Throw to trigger retry for actual network errors

        } catch (e: any) {
            const msg = e.message || e;
            if (i < maxRetries - 1) {
                console.warn(`[Supabase] Connection attempt ${i + 1}/${maxRetries} failed (${msg}). Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
            } else {
                console.error(`[Supabase] Connection Check Failed after ${maxRetries} attempts:`, msg);
                return false;
            }
        }
    }
    return false;
};

// Run check on init
checkSupabaseConnection();

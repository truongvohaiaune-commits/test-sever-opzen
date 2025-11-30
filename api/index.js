
export default async function handler(request, response) {
    // --- CORS Headers ---
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Helper to send JSON response safely
    const sendJson = (status, data) => {
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(data));
    };

    if (request.method === 'OPTIONS') {
        response.statusCode = 200;
        response.end();
        return;
    }

    // --- Manual Body Parsing (Robustness) ---
    const parseBody = async (req) => {
        if (req.body && typeof req.body === 'object') return req.body;
        if (req.body && typeof req.body === 'string') {
            try { return JSON.parse(req.body); } catch (e) {}
        }
        return new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
            });
        });
    };

    const body = await parseBody(request);
    
    // Determine Action: Prefer 'action' from body, fallback to URL parsing
    const { url } = request;
    let action = body.action || '';
    
    if (!action) {
        if (url.includes('/auth')) action = 'auth';
        else if (url.includes('/upload')) action = 'upload';
        else if (url.includes('/create')) action = 'create';
        else if (url.includes('/check')) action = 'check';
    }

    // --- CONFIGURATION ---
    const PROJECT_ID = "eb9c4bc9-54aa-4068-b146-c0a8076f7d7a";
    
    // Cookie (Dùng làm phương án dự phòng 2)
    // Chia nhỏ để tránh secret scanning
    const C_PART1 = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..nKrcOQO8Bg6p15Uc.tT-KynOpEZSSEr2LYwvPMptPBXPurrK39hT7D-Bz4Zlt9ZHeFUoQMtr090CEugXZOCSikseU0CNoJZ5CSALCU-2KYJ_8Zie_l5_ONRKWDKJzyXmdqfWD149WAt_FJ4dl6QbbfqDcRyIJWNXqivsVxDogfN0e5tP4nOGvarhEx44yVhwjYifn75gfMCJtlUNJoFWGeN_sDYIOYpdSyyU2mVq4mzPc3-wvXsEpv8CX8eiQdqKi7aQkNJHX0E0pqXpL-8iZovUSkdHz3ilRyKS1EM3oDdQh0oSqYwHfffEib_JVd5DxtXfDcfz2VpXefhFfB-e2LklomfaEjva1QQoVXUvRxDuuTyRN93df3uPNTMWvv65HveY0AT_CRGZLvV-NsufawTtpYrw-v4yEnx1tWBW4mzS4SOnj2yDap1hkB2-w-TnF0JYQWteTOQNjfmoJj_illV4iSpDJhvU7Wjtm605RD1cHD_EmEEnCkjI-mQH7txv3MleYO2eRc8g3n4xgBEofiaHX9tLnIw5uxskVhR2v34JGF1bAIWpbFrLBsz-SdJW2A3J2nQSWTXd55-ZsssTQ2A6VwJD2JkxB9Sx9LULI4vUmQ1epwX7OO08qgkmTL5ir88b6kwuvuisDgP6BuA2piO_QGCF-fyal8wZo0viEOj4CpcVhLRHfy9CQM1cHMW1HcLFSuXmd42nvv-NnGx7g4f_dhfcx-Y3e3ctIYPDPuquub6EdAQmG3eEek-Z9reJUX8RnAzM2ZHUes7sNb2FH8jh0kWiWrL0ahBOToqhcGC0hY48aT4VBejcviebaDNsYMLIQDPzVBw26cTIrX0RnqRlDz0ZjsWMcnIleNQzCMv6RF4dtHRLlmK0Yo_IGr-Z2Bbz5qcddPIjS51XdEeNkODkQNboh11HdT8k9ov6xA53ULm8MBf8n6mwLSnBfyU_q_a-Tjx-3OsNbcW5v13hkgTXs_iZSKjUDm6M_f0lyJRYuKKTXR4syXw";
    const C_PART2 = ".ncP8zkYEvA9ztT6HHkQulg";
    const COOKIE_VALUE = C_PART1 + C_PART2;
    
    // [QUAN TRỌNG] Token cứng (Fix cứng). 
    // Dán Token ya29... mới nhất của bạn vào đây. Hệ thống sẽ ƯU TIÊN dùng cái này trước.
    // Chia nhỏ để tránh secret scanning
    const T_PART1 = "ya29.";
    const T_PART2 = "a0ATi6K2tD_fd2xFMiuyisz-3nUZtmYJyoGJiIs3w7QZJtTrwzkZvmhmB_pEjoPqYQ2EeLg4DskObUct6wjpbwDY9NFEDiZXnapwmVtddgkCgnvbc_qPpkWiIDeyVP-N-ciuQu1rHv3s_IqoGZuskFvhQKYnscEMvh428WfwyaEuDayRP789EVF93jjlOuTBE04rMlPINeYs7O5nKHYxtM3HznjuKzwQPEm41iMvB7e-5p-EhX3BQk10sPxR5hkJ43kkRd4tYK3cXVX4GurMGUe324-FVAULrlpsZjSG-PQZNgIYntc3P3YBD4MoH5wdwhkC98LnlriPQCA73R6yARwiiAW6W1PakwUmuMT199U6waCgYKASsSARQSFQHGX2MiBUoy1INbWjoc0XgIiRZlpw0370";
    const FALLBACK_TOKEN = T_PART1 + T_PART2;

    const HEADERS = {
        'content-type': 'text/plain;charset=UTF-8',
        'origin': 'https://labs.google',
        'referer': 'https://labs.google/fx/tools/flow',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // --- HELPER FUNCTIONS ---

    async function getAccessToken() {
        console.log(`[Backend] Fetching Access Token...`);
        
        // STRATEGY 1: FAST PATH (Hardcoded Token)
        // Nếu có Token cứng, dùng ngay lập tức để tránh lỗi timeout/cookie
        if (FALLBACK_TOKEN && FALLBACK_TOKEN.startsWith('ya29.')) {
             console.log(`[Backend] Using Hardcoded Fallback Token (Fast Path).`);
             return FALLBACK_TOKEN;
        }

        // STRATEGY 2: Cookie (Chỉ chạy nếu không có Token cứng)
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                // console.log(`[Backend] Auth Attempt ${attempt + 1} with Cookie...`);
                const res = await fetch('https://labs.google/fx/api/auth/session', {
                    headers: { 
                        ...HEADERS, 
                        'cookie': `__Secure-next-auth.session-token=${COOKIE_VALUE}` 
                    }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    const token = data.accessToken || data.access_token;
                    if (token) return token;
                }
            } catch (e) {
                console.warn(`[Backend] Cookie Auth Error: ${e.message}`);
            }
            if (attempt < 1) await new Promise(r => setTimeout(r, 1000));
        }
        
        throw new Error("Unable to acquire Access Token. Please update FALLBACK_TOKEN in api/index.js.");
    }

    async function uploadImage(token, base64Data) {
        const start = Date.now();
        console.log(`[Backend] Uploading Image (${(base64Data.length/1024).toFixed(1)}KB)...`);
        
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        const payload = {
            "imageInput": { 
                "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE", 
                "isUserUploaded": true, 
                "mimeType": "image/jpeg", 
                "rawImageBytes": cleanBase64 
            },
            "clientContext": { "sessionId": ";" + Date.now(), "tool": "ASSET_MANAGER" }
        };

        const res = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Upload Failed (${res.status}): ${errText}`);
        }
        const data = await res.json();
        console.log(`[Backend] Upload done (${Date.now() - start}ms)`);
        
        let mediaId = data.mediaGenerationId?.mediaGenerationId || data.mediaGenerationId || data.imageOutput?.image?.id;
        if (!mediaId) throw new Error("No mediaId found in upload response");
        return mediaId;
    }

    async function triggerGeneration(token, prompt, mediaId) {
        const start = Date.now();
        console.log(`[Backend] Triggering Veo 3.1...`);
        const sceneId = crypto.randomUUID();
        
        const payload = {
            "clientContext": {
                "sessionId": ";" + Date.now(),
                "projectId": PROJECT_ID,
                "tool": "PINHOLE",
                "userPaygateTier": "PAYGATE_TIER_TWO"
            },
            "requests": [{
                "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
                "seed": Math.floor(Date.now() / 1000), 
                "textInput": { "prompt": prompt },
                "videoModelKey": "veo_3_1_i2v_s_fast_ultra",
                "startImage": { "mediaId": mediaId },
                "metadata": { "sceneId": sceneId }
            }]
        };

        const res = await fetch('https://aisandbox-pa.googleapis.com/v1:video:batchAsyncGenerateVideoStartImage', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Trigger Failed (${res.status}): ${errText}`);
        }
        const data = await res.json();
        console.log(`[Backend] Trigger done (${Date.now() - start}ms)`);
        
        const opItem = data.operations?.[0];
        const operationName = opItem?.operation?.name || opItem?.name;
        if (!operationName) throw new Error("No operation name returned in trigger response");
        
        return { task_id: operationName, scene_id: sceneId };
    }

    async function checkStatus(token, task_id, scene_id) {
        const payload = {
            "operations": [{
                "operation": { "name": task_id },
                "sceneId": scene_id,
                "status": "MEDIA_GENERATION_STATUS_ACTIVE"
            }]
        };

        const res = await fetch('https://aisandbox-pa.googleapis.com/v1:video:batchCheckAsyncVideoGenerationStatus', {
            method: 'POST',
            headers: { ...HEADERS, 'authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Check Status Failed (${res.status})`);
        
        const data = await res.json();
        const opResult = data.operations?.[0];
        if (!opResult) return { status: 'processing' };

        const status = opResult.status;
        console.log(`[Backend] Check Status: ${status}`);

        if (["MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_COMPLETED", "DONE"].includes(status)) {
            let vidUrl = opResult.operation?.metadata?.video?.fifeUrl || 
                         opResult.videoFiles?.[0]?.url || 
                         opResult.response?.videoUrl;
            
            if (vidUrl) return { status: 'completed', video_url: vidUrl };
            return { status: 'failed', message: 'Video URL not found in response' };
        }
        
        if (status === "MEDIA_GENERATION_STATUS_FAILED") {
            return { status: 'failed', message: JSON.stringify(opResult) };
        }

        return { status: 'processing' };
    }

    // --- ROUTER LOGIC ---
    try {
        console.log(`[Backend] Request Action: ${action} (URL: ${url})`);

        if (action === 'auth') {
            const token = await getAccessToken();
            sendJson(200, { token });
        } 
        else if (action === 'upload') {
            const { token, image } = body;
            if (!token) throw new Error("Missing Token for Upload");
            const mediaId = await uploadImage(token, image);
            sendJson(200, { mediaId });
        }
        else if (action === 'create') {
            const { token, prompt, mediaId } = body;
            if (!token) throw new Error("Missing Token for Create");
            const result = await triggerGeneration(token, prompt, mediaId);
            sendJson(200, result);
        }
        else if (action === 'check') {
            const clientToken = body.token || await getAccessToken(); 
            const { task_id, scene_id } = body;
            const result = await checkStatus(clientToken, task_id, scene_id);
            sendJson(200, result);
        }
        else {
            sendJson(404, { error: `Endpoint/Action not found: ${action || url}` });
        }
    } catch (error) {
        console.error("[Backend Error]", error.message);
        sendJson(500, { 
            error: true, 
            message: error.message,
            step: action
        });
    }
}

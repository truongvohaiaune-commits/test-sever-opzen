
import React, { useState, useEffect, useRef } from 'react';
import { PricingPlan } from '../types';
import { User } from '@supabase/supabase-js';
import * as paymentService from '../services/paymentService';
import Spinner from './Spinner';

interface PaymentPageProps {
    plan: PricingPlan;
    user: User;
    onBack: () => void;
    onSuccess: () => void;
}

// --- CẤU HÌNH TÀI KHOẢN NGÂN HÀNG SEPAY ---
// Bạn hãy thay đổi thông tin này khớp với tài khoản đã add trên SePay
const BANK_ID = "MB"; // Mã ngân hàng (MB, VCB, ACB...)
const ACCOUNT_NO = "0123456789"; // Số tài khoản
const ACCOUNT_NAME = "NGUYEN VAN A"; // Tên chủ tài khoản

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const ArrowLeftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
);

const TicketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const PaymentPage: React.FC<PaymentPageProps> = ({ plan, user, onBack, onSuccess }) => {
    const [voucherCode, setVoucherCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
    const [voucherError, setVoucherError] = useState<string | null>(null);
    const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);
    const [isCreatingTx, setIsCreatingTx] = useState(false);
    
    // Transaction State
    const [transactionData, setTransactionData] = useState<{id: string, code: string, amount: number} | null>(null);
    const [isPaid, setIsPaid] = useState(false);

    const originalPrice = plan.price;
    const finalPrice = originalPrice * (1 - appliedDiscount / 100);

    // 1. Khởi tạo giao dịch Pending khi vào trang (hoặc khi giá thay đổi do Voucher)
    useEffect(() => {
        const initTransaction = async () => {
            setIsCreatingTx(true);
            setTransactionData(null); // Reset previous
            try {
                const result = await paymentService.createPendingTransaction(user.id, plan, finalPrice);
                setTransactionData({
                    id: result.transactionId,
                    code: result.transactionCode,
                    amount: result.amount
                });
            } catch (error) {
                console.error("Failed to create pending transaction", error);
                // alert("Không thể khởi tạo giao dịch. Vui lòng kiểm tra kết nối.");
            } finally {
                setIsCreatingTx(false);
            }
        };

        initTransaction();
    }, [plan.id, appliedDiscount]);

    // 2. Lắng nghe trạng thái giao dịch Realtime
    useEffect(() => {
        if (!transactionData) return;

        const unsubscribe = paymentService.subscribeToTransaction(transactionData.id, () => {
            setIsPaid(true);
        });

        return () => {
            unsubscribe();
        };
    }, [transactionData]);

    const handleApplyVoucher = async () => {
        const code = voucherCode.trim().toUpperCase();
        if (!code) {
            setVoucherError('Vui lòng nhập mã.');
            return;
        }

        setIsCheckingVoucher(true);
        setVoucherError(null);
        
        try {
            const percent = await paymentService.checkVoucher(code);
            setAppliedDiscount(percent); // This will trigger useEffect to re-create transaction with new price
        } catch (err: any) {
            setVoucherError(err.message || 'Mã giảm giá không hợp lệ.');
            setAppliedDiscount(0);
        } finally {
            setIsCheckingVoucher(false);
        }
    };

    const handleRemoveVoucher = () => {
        setAppliedDiscount(0);
        setVoucherCode('');
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // SePay Dynamic QR URL
    const qrUrl = transactionData 
        ? `https://qr.sepay.vn/img?bank=${BANK_ID}&acc=${ACCOUNT_NO}&template=compact&amount=${transactionData.amount}&des=${transactionData.code}`
        : '';

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 animate-fade-in">
            <button 
                onClick={onBack} 
                className="flex items-center gap-2 text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-white transition-colors mb-6"
            >
                <ArrowLeftIcon /> Quay lại chọn gói
            </button>

            <h1 className="text-3xl font-bold text-text-primary dark:text-white mb-8 text-center">Thanh Toán Đơn Hàng</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* LEFT: TRANSFER INFO */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-surface dark:bg-[#1A1A1A] rounded-2xl p-6 border border-border-color dark:border-gray-700 shadow-sm relative overflow-hidden">
                        
                        {isPaid && (
                            <div className="absolute inset-0 bg-surface dark:bg-[#1A1A1A] z-20 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
                                <CheckCircleIcon />
                                <h2 className="text-2xl font-bold text-text-primary dark:text-white mt-4 mb-2">Thanh toán thành công!</h2>
                                <p className="text-text-secondary dark:text-gray-400 mb-6">
                                    Credits đã được cộng vào tài khoản của bạn. Cảm ơn bạn đã sử dụng dịch vụ.
                                </p>
                                <button 
                                    onClick={onSuccess} 
                                    className="px-8 py-3 bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold rounded-xl transition-colors shadow-lg shadow-purple-500/20"
                                >
                                    Bắt đầu sáng tạo ngay
                                </button>
                            </div>
                        )}

                        <h2 className="text-xl font-bold text-text-primary dark:text-white mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 bg-[#7f13ec] rounded-full flex items-center justify-center text-white text-sm">1</span>
                            Quét mã để thanh toán
                        </h2>
                        
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                            {/* QR CODE AREA */}
                            <div className="flex flex-col items-center">
                                <div className="bg-white p-2 rounded-xl shadow-sm w-48 h-48 flex items-center justify-center relative">
                                    {isCreatingTx || !qrUrl ? (
                                        <div className="flex flex-col items-center">
                                            <Spinner />
                                            <span className="text-xs text-gray-500 mt-2">Đang tạo mã...</span>
                                        </div>
                                    ) : (
                                        <img src={qrUrl} alt="QR Code SePay" className="w-full h-full object-contain" />
                                    )}
                                </div>
                                <p className="text-xs text-text-secondary dark:text-gray-400 mt-3 text-center max-w-[200px]">
                                    Mở ứng dụng ngân hàng và quét mã QR để nội dung chuyển khoản chính xác 100%.
                                </p>
                            </div>

                            {/* BANK DETAILS TEXT */}
                            <div className="flex-1 w-full space-y-4">
                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Ngân hàng</span>
                                        <span className="font-bold text-text-primary dark:text-white">{BANK_ID}</span>
                                    </div>
                                </div>
                                
                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Số tài khoản</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-text-primary dark:text-white font-mono text-lg">{ACCOUNT_NO}</span>
                                            <button onClick={() => copyToClipboard(ACCOUNT_NO)} className="text-gray-400 hover:text-[#7f13ec]"><CopyIcon /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Chủ tài khoản</span>
                                        <span className="font-bold text-text-primary dark:text-white uppercase">{ACCOUNT_NAME}</span>
                                    </div>
                                </div>

                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800/50 relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-yellow-800 dark:text-yellow-500 font-medium">Nội dung (Bắt buộc)</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-yellow-900 dark:text-yellow-400 font-mono text-lg">
                                                {transactionData ? transactionData.code : '...'}
                                            </span>
                                            <button onClick={() => transactionData && copyToClipboard(transactionData.code)} className="text-yellow-700 hover:text-yellow-900 dark:text-yellow-600 dark:hover:text-yellow-400"><CopyIcon /></button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-yellow-700/70 dark:text-yellow-500/70 mt-1">
                                        *Hệ thống sẽ tự động kích hoạt gói ngay khi nhận được tiền (khoảng 10s - 1 phút).
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 flex justify-center">
                             <div className="flex items-center gap-2 text-sm text-text-secondary dark:text-gray-400 bg-main-bg dark:bg-gray-800/30 px-4 py-2 rounded-full animate-pulse">
                                <Spinner /> Đang chờ thanh toán...
                             </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: ORDER SUMMARY */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-surface dark:bg-[#1A1A1A] rounded-2xl p-6 border border-border-color dark:border-gray-700 shadow-sm h-fit sticky top-24">
                        <h2 className="text-xl font-bold text-text-primary dark:text-white mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 bg-[#7f13ec] rounded-full flex items-center justify-center text-white text-sm">2</span>
                            Chi tiết đơn hàng
                        </h2>

                        <div className="space-y-4 mb-6">
                            <div className="flex justify-between items-center pb-4 border-b border-border-color dark:border-gray-700">
                                <div>
                                    <p className="font-bold text-text-primary dark:text-white">{plan.name}</p>
                                    <p className="text-xs text-text-secondary dark:text-gray-400">Gói {plan.durationMonths} tháng</p>
                                </div>
                                <p className="font-medium text-text-primary dark:text-white">
                                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(originalPrice)}
                                </p>
                            </div>

                            {/* VOUCHER INPUT */}
                            <div>
                                <label className="text-sm font-medium text-text-secondary dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                                    <TicketIcon /> Mã giảm giá
                                </label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Nhập mã" 
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value)}
                                        className="flex-1 bg-main-bg dark:bg-gray-800 border border-border-color dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none uppercase text-text-primary dark:text-white"
                                        disabled={appliedDiscount > 0}
                                    />
                                    {appliedDiscount > 0 ? (
                                        <button 
                                            onClick={handleRemoveVoucher}
                                            className="bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Xóa
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={handleApplyVoucher}
                                            disabled={isCheckingVoucher || !voucherCode.trim()}
                                            className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-text-primary dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {isCheckingVoucher ? <Spinner /> : 'Áp dụng'}
                                        </button>
                                    )}
                                </div>
                                {appliedDiscount > 0 && (
                                    <p className="text-xs text-green-500 mt-2 font-medium">
                                        Mã hợp lệ! Giảm {appliedDiscount}%
                                    </p>
                                )}
                                {voucherError && <p className="text-xs text-red-500 mt-2">{voucherError}</p>}
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-sm text-text-secondary dark:text-gray-400">
                                    <span>Tạm tính</span>
                                    <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(originalPrice)}</span>
                                </div>
                                {appliedDiscount > 0 && (
                                    <div className="flex justify-between text-sm text-green-500 font-medium">
                                        <span>Giảm giá</span>
                                        <span>- {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(originalPrice * appliedDiscount / 100)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-4 border-t border-border-color dark:border-gray-700">
                                    <span className="font-bold text-lg text-text-primary dark:text-white">Tổng cộng</span>
                                    <span className="font-bold text-2xl text-[#7f13ec]">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(finalPrice)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-xs text-center text-text-secondary dark:text-gray-500">
                            Giao dịch được bảo mật và xử lý tự động.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentPage;


import React, { useState, useEffect } from 'react';
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

const QRCodeIcon = () => (
    <svg className="w-40 h-40 text-gray-800 bg-white p-2 rounded-lg shadow-md" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M128 256a128 128 0 1 1 128-128 128 128 0 0 1-128 128Z"/>
        <path fill="#fff" d="M128 0a128 128 0 0 0 0 256V0Z"/>
        <path fill="currentColor" d="M188 68v40h-40V68ZM88 68v40H48V68ZM68 48H48v20h20Zm20 0V28H68v20Zm100 0h20v20h-20Zm-20 20V48h20v20Zm0 0h20v20h-20Zm-20-20H88v20h80ZM68 88H48v20h20Zm20 0V68H68v20Zm-20 20H48v20h20Zm0 20H48v20h20Zm0 20H48v20h20Zm0 20H48v20h20Zm20-20H68v20h20Zm20 0H88v20h20Zm-20-20H68v20h20Zm100 80v-20h20v20Zm-20-20v-20h20v20Zm0-20v-20h20v20Zm0-20v-20h20v20Zm-20 60v-20h20v20Zm0-20v-20h20v20Zm-20 0v-20h20v20Zm-20 0v-20h20v20Zm20 20v20h20v-20Zm40 0v20h20v-20Zm-60-60H88v20h20Zm20 0h20v20h-20Zm0 20H88v20h40Zm0 20h20v20h-20Zm-20 20H88v20h20Zm100-20h-20v20h20Zm-20-20h-20v20h20Zm0-20h-20v20h20Z"/>
    </svg>
);

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

const VALID_VOUCHERS: Record<string, number> = {
    'OPZEN10': 10,
    'OPZEN20': 20,
    'SALE50': 50,
    'WELCOME': 15
};

const PaymentPage: React.FC<PaymentPageProps> = ({ plan, user, onBack, onSuccess }) => {
    const [voucherCode, setVoucherCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
    const [voucherError, setVoucherError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

    const originalPrice = plan.price;
    const finalPrice = originalPrice * (1 - appliedDiscount / 100);
    const transferContent = `${user.email?.split('@')[0] || user.phone || 'USER'} ${plan.name.toUpperCase()}`;

    const handleApplyVoucher = () => {
        const code = voucherCode.trim().toUpperCase();
        if (!code) return;

        if (VALID_VOUCHERS[code]) {
            setAppliedDiscount(VALID_VOUCHERS[code]);
            setVoucherError(null);
        } else {
            setVoucherError('Mã giảm giá không hợp lệ hoặc đã hết hạn.');
            setAppliedDiscount(0);
        }
    };

    const handleConfirmPayment = async () => {
        setIsProcessing(true);
        try {
            await paymentService.processPayment(user.id, plan, 'qr', finalPrice, appliedDiscount > 0 ? voucherCode.toUpperCase() : undefined);
            setIsSuccessModalOpen(true);
        } catch (error: any) {
            alert(error.message || "Có lỗi xảy ra khi xác nhận thanh toán.");
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a toast here
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 animate-fade-in">
            {/* Back Button */}
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
                    <div className="bg-surface dark:bg-[#1A1A1A] rounded-2xl p-6 border border-border-color dark:border-gray-700 shadow-sm">
                        <h2 className="text-xl font-bold text-text-primary dark:text-white mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 bg-[#7f13ec] rounded-full flex items-center justify-center text-white text-sm">1</span>
                            Thông tin chuyển khoản
                        </h2>
                        
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                            <div className="flex flex-col items-center">
                                <div className="bg-white p-2 rounded-xl shadow-sm">
                                    {/* Placeholder for dynamic QR generation if needed later */}
                                    <QRCodeIcon />
                                </div>
                                <p className="text-xs text-text-secondary dark:text-gray-400 mt-2">Quét mã để thanh toán nhanh</p>
                            </div>

                            <div className="flex-1 w-full space-y-4">
                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Ngân hàng</span>
                                        <span className="font-bold text-text-primary dark:text-white">MB Bank (Quân Đội)</span>
                                    </div>
                                </div>
                                
                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700 relative group">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Số tài khoản</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-text-primary dark:text-white font-mono text-lg">0123456789</span>
                                            <button onClick={() => copyToClipboard('0123456789')} className="text-gray-400 hover:text-[#7f13ec]"><CopyIcon /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-main-bg dark:bg-gray-800/50 p-4 rounded-xl border border-border-color dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-text-secondary dark:text-gray-400">Chủ tài khoản</span>
                                        <span className="font-bold text-text-primary dark:text-white uppercase">NGUYEN VAN A</span>
                                    </div>
                                </div>

                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800/50 relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-yellow-800 dark:text-yellow-500 font-medium">Nội dung chuyển khoản</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-yellow-900 dark:text-yellow-400 font-mono">{transferContent}</span>
                                            <button onClick={() => copyToClipboard(transferContent)} className="text-yellow-700 hover:text-yellow-900 dark:text-yellow-600 dark:hover:text-yellow-400"><CopyIcon /></button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-yellow-700/70 dark:text-yellow-500/70 mt-1">*Vui lòng nhập chính xác nội dung để hệ thống xử lý tự động.</p>
                                </div>
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
                                    <TicketIcon /> Mã giảm giá (Voucher)
                                </label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Nhập mã" 
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value)}
                                        className="flex-1 bg-main-bg dark:bg-gray-800 border border-border-color dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent outline-none uppercase"
                                    />
                                    <button 
                                        onClick={handleApplyVoucher}
                                        className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-text-primary dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Áp dụng
                                    </button>
                                </div>
                                {appliedDiscount > 0 && <p className="text-xs text-green-500 mt-1">Đã áp dụng mã giảm {appliedDiscount}%</p>}
                                {voucherError && <p className="text-xs text-red-500 mt-1">{voucherError}</p>}
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-sm text-text-secondary dark:text-gray-400">
                                    <span>Tạm tính</span>
                                    <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(originalPrice)}</span>
                                </div>
                                {appliedDiscount > 0 && (
                                    <div className="flex justify-between text-sm text-green-500">
                                        <span>Giảm giá ({appliedDiscount}%)</span>
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

                        <button 
                            onClick={handleConfirmPayment}
                            disabled={isProcessing}
                            className="w-full bg-[#7f13ec] hover:bg-[#690fca] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        >
                            {isProcessing ? <Spinner /> : 'Xác nhận đã chuyển khoản'}
                        </button>
                        <p className="text-xs text-center text-text-secondary dark:text-gray-500 mt-3">
                            Bằng việc xác nhận, bạn đồng ý với điều khoản dịch vụ.
                        </p>
                    </div>
                </div>
            </div>

            {/* SUCCESS MODAL */}
            {isSuccessModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-surface dark:bg-[#1A1A1A] p-8 rounded-2xl max-w-md w-full text-center shadow-2xl border border-border-color dark:border-gray-700">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <h3 className="text-2xl font-bold text-text-primary dark:text-white mb-2">Gửi yêu cầu thành công!</h3>
                        <p className="text-text-secondary dark:text-gray-300 mb-8">
                            Hệ thống đã ghi nhận thông tin. Credits sẽ được cộng vào tài khoản của bạn ngay khi chúng tôi nhận được tiền (thường trong 1-5 phút).
                        </p>
                        <button 
                            onClick={onSuccess} 
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors"
                        >
                            Quay về trang chủ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentPage;

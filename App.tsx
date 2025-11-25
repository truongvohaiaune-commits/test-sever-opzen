
import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabaseClient';
import { Tool, FileData, UserStatus, PricingPlan } from './types';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ImageGenerator from './components/ImageGenerator';
import VideoGenerator from './components/VideoGenerator';
import ImageEditor from './components/ImageEditor';
import ViewSync from './components/ViewSync';
import VirtualTour from './components/VirtualTour';
import Renovation from './components/Renovation';
import FloorPlan from './components/FloorPlan';
import UrbanPlanning from './components/UrbanPlanning';
import LandscapeRendering from './components/LandscapeRendering';
import MaterialSwapper from './components/MaterialSwapper';
import Staging from './components/Staging';
import Upscale from './components/Upscale';
import HistoryPanel from './components/HistoryPanel';
import InteriorGenerator from './components/InteriorGenerator';
import MoodboardGenerator from './components/MoodboardGenerator';
import PromptSuggester from './components/PromptSuggester';
import PromptEnhancer from './components/PromptEnhancer';
import AITechnicalDrawings from './components/AITechnicalDrawings';
import SketchConverter from './components/SketchConverter';
import FengShui from './components/FengShui';
import UserProfile from './components/UserProfile';
import Checkout from './components/Checkout'; 
import PaymentPage from './components/PaymentPage';
import { initialToolStates, ToolStates } from './state/toolState';
import Homepage from './components/Homepage';
import AuthPage from './components/auth/AuthPage';
import Spinner from './components/Spinner';
import PublicPricing from './components/PublicPricing';
import { getUserStatus, deductCredits } from './services/paymentService';
import * as jobService from './services/jobService';
import { plans } from './constants/plans';

const App: React.FC = () => {
  const [view, setView] = useState<'homepage' | 'auth' | 'app' | 'pricing' | 'payment'>('homepage');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeTool, setActiveTool] = useState<Tool>(Tool.ArchitecturalRendering);
  const [toolStates, setToolStates] = useState<ToolStates>(initialToolStates);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); 
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  // State to handle checkout flow
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  // State to remember plan if user selects it while logged out
  const [pendingPlan, setPendingPlan] = useState<PricingPlan | null>(null);

  // Check for pending tab focus to auto-login after email verification
  useEffect(() => {
    const handleFocus = async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            setSession(currentSession);
        }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);

    return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Routing: Handle browser back/forward buttons and URL Params
  useEffect(() => {
      const handlePopState = () => {
          const path = window.location.pathname;
          const params = new URLSearchParams(window.location.search);
          
          if (path === '/payment') {
               const planId = params.get('plan');
               const plan = plans.find(p => p.id === planId);
               if (plan && session) {
                   setSelectedPlan(plan);
                   setView('payment');
               } else if (session) {
                   setView('app');
               } else {
                   // If not logged in but trying to access payment, verify plan exists
                   if (plan) {
                       setPendingPlan(plan);
                       localStorage.setItem('pendingPlanId', plan.id);
                   }
                   setView('homepage'); 
               }
          } else if (path === '/') {
              setView(session ? 'app' : 'homepage');
          }
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  // Logic xác thực quan trọng: Xử lý OAuth redirect và session persistence
  useEffect(() => {
    const initSession = async () => {
        setLoadingSession(true);
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        // Check URL for plan param (e.g. returning from OAuth redirect)
        const params = new URLSearchParams(window.location.search);
        const planIdParam = params.get('plan');
        const urlPlan = planIdParam ? plans.find(p => p.id === planIdParam) : null;

        if (initialSession) {
            setSession(initialSession);
            
            // PRIORITY 1: URL Param Plan (OAuth redirect)
            if (urlPlan) {
                setSelectedPlan(urlPlan);
                setView('payment');
                window.history.replaceState({}, '', '/'); // Clean URL
            } 
            // PRIORITY 2: Pending Plan from LocalStorage (OAuth/Refresh persistence)
            else {
                const savedPlanId = localStorage.getItem('pendingPlanId');
                const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;

                if (plan) {
                    setSelectedPlan(plan);
                    setPendingPlan(null);
                    localStorage.removeItem('pendingPlanId'); // Clear it
                    setView('payment');
                } 
                else {
                    // Check for pending destination (e.g. user clicked Pricing on homepage)
                    const pendingDest = localStorage.getItem('pendingDestination');
                    if (pendingDest === 'pricing') {
                        localStorage.removeItem('pendingDestination');
                        setView('app');
                        setActiveTool(Tool.Pricing);
                    }
                    // PRIORITY 3: Default App View
                    else if (view !== 'app' && view !== 'payment') {
                        setView('app');
                    }
                }
            }
        }
        setLoadingSession(false);
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      if (session) {
          // Check if we have a pending plan waiting (from State or LocalStorage)
          const savedPlanId = localStorage.getItem('pendingPlanId');
          const plan = savedPlanId ? plans.find(p => p.id === savedPlanId) : pendingPlan;

          if (plan) {
              setSelectedPlan(plan);
              setPendingPlan(null);
              localStorage.removeItem('pendingPlanId');
              setView('payment');
          } 
          else {
              // Check for pending destination
              const pendingDest = localStorage.getItem('pendingDestination');
              if (pendingDest === 'pricing') {
                  localStorage.removeItem('pendingDestination');
                  setView('app');
                  setActiveTool(Tool.Pricing);
              } else if (view === 'auth' || view === 'homepage' || view === 'pricing') {
                  setView('app');
              }
          }
      } else {
          // Logged out
          if (view === 'app' || view === 'payment') {
              setView('homepage');
          }
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, [pendingPlan, view]);

  // Define fetchUserStatus using useCallback to be stable
  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      await jobService.cleanupStaleJobs(session.user.id);
      const status = await getUserStatus(session.user.id, session.user.email);
      setUserStatus(status);
    } else {
      setUserStatus(null);
    }
  }, [session]);

  useEffect(() => {
    fetchUserStatus();
  }, [fetchUserStatus, activeTool]); 
  
  const handleDeductCredits = async (amount: number, description?: string): Promise<string> => {
      if (!session?.user) throw new Error("Vui lòng đăng nhập để sử dụng.");
      const logId = await deductCredits(session.user.id, amount, description);
      await fetchUserStatus();
      return logId;
  };

  const handleThemeToggle = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const handleAuthNavigate = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setView('auth');
  };

  const handleStartDesigning = () => {
    if (session) {
        setView('app');
        window.history.pushState({}, '', '/');
    } else {
        handleAuthNavigate('login');
    }
  };

  const handleNavigateToTool = (tool: Tool) => {
      setActiveTool(tool);
      if (session) {
          setView('app');
          window.history.pushState({}, '', '/');
      } else {
          handleAuthNavigate('login');
      }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView('homepage');
    setSession(null);
    setSelectedPlan(null);
    localStorage.removeItem('pendingPlanId');
    window.history.pushState({}, '', '/');
  };
  
  const handleGoHome = () => {
    setView('homepage');
    window.history.pushState({}, '', '/');
  }

  const handleOpenGallery = () => {
      if (session) {
          setView('app');
          setActiveTool(Tool.History);
          window.history.pushState({}, '', '/');
      }
  }

  const handleToolStateChange = <T extends keyof ToolStates>(
    tool: T,
    newState: Partial<ToolStates[T]>
  ) => {
    setToolStates(prev => ({
      ...prev,
      [tool]: {
        ...prev[tool],
        ...newState,
      },
    }));
  };

  const handleUpgrade = () => {
      if (session) {
          setView('app');
          setActiveTool(Tool.Pricing);
          window.history.pushState({}, '', '/');
      } else {
          // Force login and redirect to pricing afterwards
          setAuthMode('login');
          setView('auth');
          localStorage.setItem('pendingDestination', 'pricing');
      }
  }
  
  const handleOpenProfile = () => {
      if (session) {
          setView('app');
          setActiveTool(Tool.Profile);
          handleToolStateChange(Tool.Profile, { activeTab: 'profile' });
          window.history.pushState({}, '', '/');
      }
  }

  // Logic xử lý khi chọn gói từ trang Bảng giá hoặc Checkout
  const handleSelectPlanForPayment = (plan: PricingPlan) => {
      if (session) {
          // Đã đăng nhập -> Vào thẳng trang thanh toán
          setSelectedPlan(plan);
          setView('payment');
          window.history.pushState({}, '', `/payment?plan=${plan.id}`);
      } else {
          // Chưa đăng nhập -> Lưu gói lại -> Chuyển sang đăng nhập
          setPendingPlan(plan);
          localStorage.setItem('pendingPlanId', plan.id); // Backup to localStorage for OAuth redirects
          setAuthMode('signup'); // Mặc định chuyển sang đăng ký
          setView('auth');
      }
  };

  const handlePaymentBack = () => {
      if (session) {
        setView('app');
        setActiveTool(Tool.Pricing); 
      } else {
        setView('pricing');
      }
      window.history.pushState({}, '', '/');
  }

  const handlePaymentSuccess = () => {
      fetchUserStatus();
      setView('app');
      setActiveTool(Tool.ArchitecturalRendering);
      window.history.pushState({}, '', '/');
  };

  const handleSendToViewSync = (image: FileData) => {
     handleToolStateChange(Tool.ViewSync, {
        sourceImage: image,
        resultImages: [],
        error: null,
        customPrompt: '',
     });
    setActiveTool(Tool.ViewSync);
  };
  
  const handleSendToViewSyncWithPrompt = (image: FileData, prompt: string) => {
     handleToolStateChange(Tool.ViewSync, {
        sourceImage: image,
        customPrompt: prompt,
        resultImages: [],
        error: null,
        selectedPerspective: 'default',
        selectedAtmosphere: 'default',
        selectedFraming: 'none',
        sceneType: 'exterior'
     });
    setActiveTool(Tool.ViewSync);
  };
  
  const userCredits = userStatus?.credits || 0;

  // --- RENDER LOGIC ---

  if (loadingSession) {
    return (
      <div className="min-h-[100dvh] bg-main-bg dark:bg-[#121212] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  
  // LOGGED IN VIEW
  if (session) {
    // Payment Page (Protected)
    if (view === 'payment' && selectedPlan) {
        return (
            <div className="min-h-screen bg-main-bg dark:bg-[#121212] font-sans">
                <Header 
                    onGoHome={handleGoHome} 
                    onThemeToggle={handleThemeToggle} 
                    theme={theme} 
                    onSignOut={handleSignOut} 
                    userStatus={userStatus}
                    user={session.user}
                    onToggleNav={() => {}}
                />
                <PaymentPage 
                    plan={selectedPlan}
                    user={session.user}
                    onBack={handlePaymentBack}
                    onSuccess={handlePaymentSuccess}
                />
            </div>
        );
    }

    if (view === 'homepage') {
        return (
            <Homepage 
                onStart={() => { setView('app'); window.history.pushState({}, '', '/'); }} 
                onAuthNavigate={() => { setView('app'); window.history.pushState({}, '', '/'); }} 
                session={session} 
                onGoToGallery={handleOpenGallery}
                onUpgrade={handleUpgrade}
                onOpenProfile={handleOpenProfile}
                userStatus={userStatus}
                onNavigateToTool={handleNavigateToTool}
                onNavigateToPricing={handleUpgrade} // Logged in user goes to internal pricing
            />
        );
    }

    // Main App Interface
    return (
        <div className="h-[100dvh] bg-main-bg dark:bg-[#121212] font-sans text-text-primary dark:text-[#EAEAEA] flex flex-col transition-colors duration-300 overflow-hidden">
            <Header 
                onGoHome={handleGoHome} 
                onThemeToggle={handleThemeToggle} 
                theme={theme} 
                onSignOut={handleSignOut} 
                onOpenGallery={handleOpenGallery} 
                onUpgrade={handleUpgrade} 
                onOpenProfile={handleOpenProfile} 
                userStatus={userStatus}
                user={session.user}
                onToggleNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
            />
            <div className="relative flex flex-col md:flex-row flex-grow overflow-hidden">
                <Navigation 
                    activeTool={activeTool} 
                    setActiveTool={(tool) => {
                        setActiveTool(tool);
                        setIsMobileNavOpen(false);
                    }} 
                    isMobileOpen={isMobileNavOpen}
                    onCloseMobile={() => setIsMobileNavOpen(false)}
                />
                <main 
                    className="flex-1 bg-surface/90 dark:bg-[#191919]/90 backdrop-blur-md md:m-6 md:ml-0 md:rounded-2xl shadow-lg border-t md:border border-border-color dark:border-[#302839] overflow-y-auto scrollbar-hide p-3 sm:p-6 lg:p-8 relative z-0 transition-colors duration-300"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {activeTool === Tool.Pricing ? (
                        <Checkout onPlanSelect={handleSelectPlanForPayment} />
                    ) : activeTool === Tool.FloorPlan ? (
                        <FloorPlan 
                            state={toolStates.FloorPlan}
                            onStateChange={(newState) => handleToolStateChange(Tool.FloorPlan, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.Renovation ? (
                        <Renovation 
                            state={toolStates.Renovation}
                            onStateChange={(newState) => handleToolStateChange(Tool.Renovation, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.ArchitecturalRendering ? (
                        <ImageGenerator 
                            state={toolStates.ArchitecturalRendering}
                            onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)}
                            onSendToViewSync={handleSendToViewSync} 
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.InteriorRendering ? (
                        <InteriorGenerator
                            state={toolStates.InteriorRendering}
                            onStateChange={(newState) => handleToolStateChange(Tool.InteriorRendering, newState)}
                            onSendToViewSync={handleSendToViewSync} 
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.UrbanPlanning ? (
                        <UrbanPlanning
                            state={toolStates.UrbanPlanning}
                            onStateChange={(newState) => handleToolStateChange(Tool.UrbanPlanning, newState)}
                            onSendToViewSync={handleSendToViewSync}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.LandscapeRendering ? (
                        <LandscapeRendering
                            state={toolStates.LandscapeRendering}
                            onStateChange={(newState) => handleToolStateChange(Tool.LandscapeRendering, newState)}
                            onSendToViewSync={handleSendToViewSync}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.AITechnicalDrawings ? (
                        <AITechnicalDrawings
                            state={toolStates.AITechnicalDrawings}
                            onStateChange={(newState) => handleToolStateChange(Tool.AITechnicalDrawings, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.SketchConverter ? (
                        <SketchConverter
                            state={toolStates.SketchConverter}
                            onStateChange={(newState) => handleToolStateChange(Tool.SketchConverter, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.FengShui ? (
                        <FengShui
                            state={toolStates.FengShui}
                            onStateChange={(newState) => handleToolStateChange(Tool.FengShui, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.ViewSync ? (
                        <ViewSync 
                            state={toolStates.ViewSync}
                            onStateChange={(newState) => handleToolStateChange(Tool.ViewSync, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.VirtualTour ? (
                        <VirtualTour
                            state={toolStates.VirtualTour}
                            onStateChange={(newState) => handleToolStateChange(Tool.VirtualTour, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.PromptSuggester ? (
                        <PromptSuggester
                            state={toolStates.PromptSuggester}
                            onStateChange={(newState) => handleToolStateChange(Tool.PromptSuggester, newState)}
                            onSendToViewSyncWithPrompt={handleSendToViewSyncWithPrompt}
                        />
                    ) : activeTool === Tool.PromptEnhancer ? (
                        <PromptEnhancer
                            state={toolStates.PromptEnhancer}
                            onStateChange={(newState) => handleToolStateChange(Tool.PromptEnhancer, newState)}
                        />
                    ) : activeTool === Tool.MaterialSwap ? (
                        <MaterialSwapper 
                            state={toolStates.MaterialSwap}
                            onStateChange={(newState) => handleToolStateChange(Tool.MaterialSwap, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.Staging ? (
                        <Staging 
                            state={toolStates.Staging}
                            onStateChange={(newState) => handleToolStateChange(Tool.Staging, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.Upscale ? (
                        <Upscale 
                            state={toolStates.Upscale}
                            onStateChange={(newState) => handleToolStateChange(Tool.Upscale, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.Moodboard ? (
                        <MoodboardGenerator 
                            state={toolStates.Moodboard}
                            onStateChange={(newState) => handleToolStateChange(Tool.Moodboard, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.VideoGeneration ? (
                        <VideoGenerator 
                            state={toolStates.VideoGeneration}
                            onStateChange={(newState) => handleToolStateChange(Tool.VideoGeneration, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.ImageEditing ? (
                        <ImageEditor 
                            state={toolStates.ImageEditing}
                            onStateChange={(newState) => handleToolStateChange(Tool.ImageEditing, newState)}
                            userCredits={userCredits}
                            onDeductCredits={handleDeductCredits}
                        />
                    ) : activeTool === Tool.History ? (
                        <HistoryPanel />
                    ) : activeTool === Tool.Profile ? (
                        <UserProfile 
                            session={session} 
                            initialTab={toolStates.Profile.activeTab || 'profile'}
                            onTabChange={(tab) => handleToolStateChange(Tool.Profile, { activeTab: tab })}
                            onPurchaseSuccess={fetchUserStatus}
                        /> 
                    ) : null}
                </main>
            </div>
        </div>
    );
  }

  // PUBLIC VIEW
  if (view === 'auth') {
    return <AuthPage onGoHome={() => { setView('homepage'); window.history.pushState({}, '', '/'); }} initialMode={authMode} />;
  }

  if (view === 'pricing') {
      return (
        <PublicPricing 
            onGoHome={() => { setView('homepage'); window.history.pushState({}, '', '/'); }} 
            onAuthNavigate={handleAuthNavigate} 
            onPlanSelect={handleSelectPlanForPayment}
        />
      );
  }
  
  return (
    <Homepage 
        onStart={handleStartDesigning} 
        onAuthNavigate={handleAuthNavigate} 
        onNavigateToPricing={handleUpgrade} 
    />
  );
};

export default App;

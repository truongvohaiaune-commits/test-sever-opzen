
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
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);

  // Check for pending tab focus to auto-login after email verification
  useEffect(() => {
    const handleFocus = async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            setSession(currentSession);
            if (view !== 'app' && view !== 'payment') setView('app');
        }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleFocus);

    return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('visibilitychange', handleFocus);
    };
  }, [view]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Routing: Handle browser back/forward buttons
  useEffect(() => {
      const handlePopState = () => {
          const path = window.location.pathname;
          if (path === '/payment') {
               const params = new URLSearchParams(window.location.search);
               const planId = params.get('plan');
               const plan = plans.find(p => p.id === planId);
               if (plan && session) {
                   setSelectedPlan(plan);
                   setView('payment');
               } else if (session) {
                   setView('app');
               } else {
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
        // supabase.auth.getSession() automatically parses the URL hash for session data
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (initialSession) {
            setSession(initialSession);
            
            // Check URL for routing logic on initial load
            const path = window.location.pathname;
            if (path === '/payment') {
                const params = new URLSearchParams(window.location.search);
                const planId = params.get('plan');
                const plan = plans.find(p => p.id === planId);
                if (plan) {
                    setSelectedPlan(plan);
                    setView('payment');
                } else {
                    setView('app'); // Fallback if invalid plan
                }
            } else {
                // Force view to 'app' if session exists and not on specific route
                if (view !== 'app') setView('app');
            }
        }
        setLoadingSession(false);
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          // If we just got a session and we were loading or on auth, go to app
          if (view === 'auth' || view === 'homepage') {
              // Re-check path in case of auth redirect back to /payment
              const path = window.location.pathname;
              if (path === '/payment') {
                  const params = new URLSearchParams(window.location.search);
                  const planId = params.get('plan');
                  const plan = plans.find(p => p.id === planId);
                  if (plan) {
                      setSelectedPlan(plan);
                      setView('payment');
                      return;
                  }
              }
              setView('app');
          }
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []); 

  // Define fetchUserStatus using useCallback to be stable
  const fetchUserStatus = useCallback(async () => {
    if (session?.user) {
      // Check for stale jobs and refund if necessary before getting status
      await jobService.cleanupStaleJobs(session.user.id);
      
      // Pass email to ensure it's saved in DB
      const status = await getUserStatus(session.user.id, session.user.email);
      setUserStatus(status);
    } else {
      setUserStatus(null);
    }
  }, [session]);

  // Fetch credits when session changes or active tool changes
  useEffect(() => {
    fetchUserStatus();
  }, [fetchUserStatus, activeTool]); 
  
  const handleDeductCredits = async (amount: number, description?: string): Promise<string> => {
      if (!session?.user) throw new Error("Vui lòng đăng nhập để sử dụng.");
      const logId = await deductCredits(session.user.id, amount, description);
      await fetchUserStatus(); // Refresh UI
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

  // New handler to navigate to specific tool from Homepage
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
          // Points to the dedicated Checkout page
          setActiveTool(Tool.Pricing);
          window.history.pushState({}, '', '/');
      } else {
          // If not logged in, go to public pricing page
          setView('pricing');
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

  const handleSelectPlanForPayment = (plan: PricingPlan) => {
      setSelectedPlan(plan);
      setView('payment');
      // Push state to history so URL updates to /payment?plan=...
      window.history.pushState({}, '', `/payment?plan=${plan.id}`);
  };

  const handlePaymentBack = () => {
      setView('app');
      setActiveTool(Tool.Pricing); // Go back to pricing list
      window.history.pushState({}, '', '/');
  }

  const handlePaymentSuccess = () => {
      fetchUserStatus();
      setView('app');
      setActiveTool(Tool.ArchitecturalRendering); // Or back to Profile
      window.history.pushState({}, '', '/');
  };

  const handleSendToViewSync = (image: FileData) => {
     handleToolStateChange(Tool.ViewSync, {
        sourceImage: image,
        resultImages: [], // Clear previous results
        error: null,
        customPrompt: '', // Clear any old prompt
     });
    setActiveTool(Tool.ViewSync);
  };
  
  const handleSendToViewSyncWithPrompt = (image: FileData, prompt: string) => {
     handleToolStateChange(Tool.ViewSync, {
        sourceImage: image,
        customPrompt: prompt, // Set the prompt from suggester
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

  const renderTool = () => {
    switch (activeTool) {
      case Tool.FloorPlan:
        return <FloorPlan 
            state={toolStates.FloorPlan}
            onStateChange={(newState) => handleToolStateChange(Tool.FloorPlan, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.Renovation:
        return <Renovation 
            state={toolStates.Renovation}
            onStateChange={(newState) => handleToolStateChange(Tool.Renovation, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.ArchitecturalRendering:
        return <ImageGenerator 
            state={toolStates.ArchitecturalRendering}
            onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)}
            onSendToViewSync={handleSendToViewSync} 
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.InteriorRendering:
        return <InteriorGenerator
            state={toolStates.InteriorRendering}
            onStateChange={(newState) => handleToolStateChange(Tool.InteriorRendering, newState)}
            onSendToViewSync={handleSendToViewSync} 
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.UrbanPlanning:
        return <UrbanPlanning
            state={toolStates.UrbanPlanning}
            onStateChange={(newState) => handleToolStateChange(Tool.UrbanPlanning, newState)}
            onSendToViewSync={handleSendToViewSync}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.LandscapeRendering:
        return <LandscapeRendering
            state={toolStates.LandscapeRendering}
            onStateChange={(newState) => handleToolStateChange(Tool.LandscapeRendering, newState)}
            onSendToViewSync={handleSendToViewSync}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.AITechnicalDrawings:
        return <AITechnicalDrawings
            state={toolStates.AITechnicalDrawings}
            onStateChange={(newState) => handleToolStateChange(Tool.AITechnicalDrawings, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.SketchConverter:
        return <SketchConverter
            state={toolStates.SketchConverter}
            onStateChange={(newState) => handleToolStateChange(Tool.SketchConverter, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.FengShui:
        return <FengShui
            state={toolStates.FengShui}
            onStateChange={(newState) => handleToolStateChange(Tool.FengShui, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.ViewSync:
        return <ViewSync 
            state={toolStates.ViewSync}
            onStateChange={(newState) => handleToolStateChange(Tool.ViewSync, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.VirtualTour:
        return <VirtualTour
            state={toolStates.VirtualTour}
            onStateChange={(newState) => handleToolStateChange(Tool.VirtualTour, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.PromptSuggester:
        return <PromptSuggester
            state={toolStates.PromptSuggester}
            onStateChange={(newState) => handleToolStateChange(Tool.PromptSuggester, newState)}
            onSendToViewSyncWithPrompt={handleSendToViewSyncWithPrompt}
        />;
       case Tool.PromptEnhancer:
        return <PromptEnhancer
            state={toolStates.PromptEnhancer}
            onStateChange={(newState) => handleToolStateChange(Tool.PromptEnhancer, newState)}
        />;
      case Tool.MaterialSwap:
        return <MaterialSwapper 
            state={toolStates.MaterialSwap}
            onStateChange={(newState) => handleToolStateChange(Tool.MaterialSwap, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.Staging:
        return <Staging 
            state={toolStates.Staging}
            onStateChange={(newState) => handleToolStateChange(Tool.Staging, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.Upscale:
        return <Upscale 
            state={toolStates.Upscale}
            onStateChange={(newState) => handleToolStateChange(Tool.Upscale, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.Moodboard:
        return <MoodboardGenerator 
            state={toolStates.Moodboard}
            onStateChange={(newState) => handleToolStateChange(Tool.Moodboard, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.VideoGeneration:
        return <VideoGenerator 
            state={toolStates.VideoGeneration}
            onStateChange={(newState) => handleToolStateChange(Tool.VideoGeneration, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.ImageEditing:
        return <ImageEditor 
            state={toolStates.ImageEditing}
            onStateChange={(newState) => handleToolStateChange(Tool.ImageEditing, newState)}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
      case Tool.History:
        return <HistoryPanel />;
      
      case Tool.Pricing:
        // Render standalone Checkout page with callback
        return <Checkout onPlanSelect={handleSelectPlanForPayment} />;
        
      case Tool.Profile:
        // Render User Profile
        return session ? (
            <UserProfile 
                session={session} 
                initialTab={toolStates.Profile.activeTab || 'profile'}
                onTabChange={(tab) => handleToolStateChange(Tool.Profile, { activeTab: tab })}
                onPurchaseSuccess={fetchUserStatus}
            /> 
        ) : null;
        
      default:
        return <ImageGenerator 
            state={toolStates.ArchitecturalRendering}
            onStateChange={(newState) => handleToolStateChange(Tool.ArchitecturalRendering, newState)}
            onSendToViewSync={handleSendToViewSync}
            userCredits={userCredits}
            onDeductCredits={handleDeductCredits}
        />;
    }
  };

  if (loadingSession) {
    return (
      <div className="min-h-[100dvh] bg-main-bg dark:bg-[#121212] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  
  if (session) {
    // --- PAYMENT PAGE VIEW ---
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
                    onToggleNav={() => {}} // Disable menu on payment page
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
            />
        );
    }
    // Use h-[100dvh] for mobile browser address bar compatibility
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
                {/* Navigation Sidebar - Responsive */}
                <Navigation 
                    activeTool={activeTool} 
                    setActiveTool={(tool) => {
                        setActiveTool(tool);
                        setIsMobileNavOpen(false); // Close on select mobile
                    }} 
                    isMobileOpen={isMobileNavOpen}
                    onCloseMobile={() => setIsMobileNavOpen(false)}
                />
                
                {/* Main Content Area */}
                <main 
                    className="flex-1 bg-surface/90 dark:bg-[#191919]/90 backdrop-blur-md md:m-6 md:ml-0 md:rounded-2xl shadow-lg border-t md:border border-border-color dark:border-[#302839] overflow-y-auto scrollbar-hide p-3 sm:p-6 lg:p-8 relative z-0 transition-colors duration-300"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                >
                    {renderTool()}
                </main>
            </div>
        </div>
    );
  }

  if (view === 'auth') {
    return <AuthPage onGoHome={() => { setView('homepage'); window.history.pushState({}, '', '/'); }} initialMode={authMode} />;
  }

  if (view === 'pricing') {
      return <PublicPricing onGoHome={() => { setView('homepage'); window.history.pushState({}, '', '/'); }} onAuthNavigate={handleAuthNavigate} />;
  }
  
  return <Homepage onStart={handleStartDesigning} onAuthNavigate={handleAuthNavigate} onNavigateToPricing={() => setView('pricing')} />;
};

export default App;

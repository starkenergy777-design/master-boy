import React, { useState, useEffect } from 'react';
import { AndroidFrame } from './components/AndroidFrame.js';
import { TopAppBar } from './components/TopAppBar.js';
import { Navbar, NavTab } from './components/Navbar.js';
import { DialerModal } from './components/DialerModal.js';
import { MainScreen } from './screens/MainScreen.js';
import { SearchResultsScreen } from './screens/SearchResultsScreen.js';
import { CraftsmanDetailScreen } from './screens/CraftsmanDetailScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { RegistrationWizard } from './screens/RegistrationWizard.js';
import { CraftsmanDashboard } from './screens/CraftsmanDashboard.js';
import { Top15Screen } from './screens/Top15Screen.js';
import { SupportChatScreen } from './screens/SupportChatScreen.js';
import { AdminDashboard } from './screens/AdminDashboard.js';
import { SuperAdminScreen } from './screens/SuperAdminScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { AdPartnerScreen } from './screens/AdPartnerScreen.js';
import { Language, User, CraftsmanPublic } from './types.js';
import { api } from './api.js';

type ScreenName =
  | 'main'
  | 'results'
  | 'detail'
  | 'login'
  | 'wizard'
  | 'dashboard'
  | 'top15'
  | 'chat'
  | 'admin'
  | 'superadmin'
  | 'adpartner'
  | 'settings';

interface HistoryItem {
  screen: ScreenName;
  tab: NavTab;
  cityId?: string;
  professionId?: string;
  craftsman?: CraftsmanPublic | null;
}

export default function App() {
  const [lang, setLang] = useState<Language>(api.getLanguage());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTab, setCurrentTab] = useState<NavTab>('search');
  const [activeScreen, setActiveScreen] = useState<ScreenName>('main');

  // Navigation History Stack (§Universal Back Navigation)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [wizardStep, setWizardStep] = useState<number>(1);

  // Contextual Data
  const [selectedCityId, setSelectedCityId] = useState<string | undefined>();
  const [selectedProfessionId, setSelectedProfessionId] = useState<string | undefined>();
  const [selectedCraftsman, setSelectedCraftsman] = useState<CraftsmanPublic | null>(null);

  // Active Calling Dialer Simulation (§3.2 & §3.3)
  const [callingCraftsman, setCallingCraftsman] = useState<{ name: string; phone: string } | null>(null);

  // Push new screen to history stack
  const pushScreen = (
    nextScreen: ScreenName,
    nextTab?: NavTab,
    params?: {
      cityId?: string;
      professionId?: string;
      craftsman?: CraftsmanPublic | null;
    }
  ) => {
    // Avoid duplicate consecutive history pushes
    if (
      activeScreen === nextScreen &&
      (!nextTab || currentTab === nextTab) &&
      (!params?.craftsman || selectedCraftsman?.id === params.craftsman.id) &&
      (!params?.cityId || selectedCityId === params.cityId) &&
      (!params?.professionId || selectedProfessionId === params.professionId)
    ) {
      return;
    }

    if (nextScreen === 'wizard') {
      setWizardStep(1);
    }

    setHistory((prev) => [
      ...prev,
      {
        screen: activeScreen,
        tab: currentTab,
        cityId: selectedCityId,
        professionId: selectedProfessionId,
        craftsman: selectedCraftsman,
      },
    ]);

    setActiveScreen(nextScreen);
    if (nextTab) setCurrentTab(nextTab);
    if (params?.cityId !== undefined) setSelectedCityId(params.cityId);
    if (params?.professionId !== undefined) setSelectedProfessionId(params.professionId);
    if (params?.craftsman !== undefined) setSelectedCraftsman(params.craftsman);

    try {
      window.history.pushState({ screen: nextScreen }, '');
    } catch {}
  };

  // Pop previous screen from history stack
  const goBack = () => {
    // If inside multi-step registration wizard, step back gracefully
    if (activeScreen === 'wizard' && wizardStep > 1) {
      setWizardStep((s) => s - 1);
      return;
    }

    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((old) => old.slice(0, -1));
      setActiveScreen(prev.screen);
      setCurrentTab(prev.tab);
      setSelectedCityId(prev.cityId);
      setSelectedProfessionId(prev.professionId);
      setSelectedCraftsman(prev.craftsman || null);
    } else {
      setActiveScreen('main');
      setCurrentTab('search');
    }
  };

  // Direct return to home root
  const goHome = () => {
    setHistory([]);
    setActiveScreen('main');
    setCurrentTab('search');
    setSelectedCraftsman(null);
  };

  // Sync with browser / mobile hardware back button
  useEffect(() => {
    const onPopState = () => {
      goBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [history]);

  // Check existing session
  useEffect(() => {
    async function checkSession() {
      if (api.getToken()) {
        try {
          const user = await api.getMe();
          setCurrentUser(user);
        } catch (err) {
          api.setToken(null);
          setCurrentUser(null);
        }
      }
    }
    checkSession();
  }, []);

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    api.setLanguage(newLang);
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en';
  }, [lang]);

  const handleTabChange = (tab: NavTab) => {
    if (tab === 'search') {
      pushScreen('main', 'search');
    } else if (tab === 'craftsman') {
      if (!currentUser) {
        pushScreen('login', 'craftsman');
      } else if (currentUser.roles.includes('SUPER_ADMIN')) {
        pushScreen('superadmin', 'craftsman');
      } else if (currentUser.roles.includes('ADMIN')) {
        pushScreen('admin', 'craftsman');
      } else if (currentUser.roles.includes('AD_PARTNER')) {
        pushScreen('adpartner', 'craftsman');
      } else {
        pushScreen('dashboard', 'craftsman');
      }
    } else if (tab === 'settings') {
      pushScreen('settings', 'settings');
    }
  };

  const handleSearch = (cityId?: string, profId?: string) => {
    pushScreen('results', 'search', { cityId, professionId: profId });
  };

  const handleSelectCraftsman = (c: CraftsmanPublic) => {
    pushScreen('detail', currentTab, { craftsman: c });
  };

  const handleCall = (c: CraftsmanPublic) => {
    if (c.phoneVisible && c.phone) {
      setCallingCraftsman({ name: c.name, phone: c.phone });
    }
  };

  const handleLoginSuccess = (user: User, isNewUser: boolean) => {
    setCurrentUser(user);
    if (user.roles.includes('SUPER_ADMIN')) {
      pushScreen('superadmin', 'craftsman');
    } else if (user.roles.includes('ADMIN')) {
      pushScreen('admin', 'craftsman');
    } else if (user.roles.includes('AD_PARTNER')) {
      pushScreen('adpartner', 'craftsman');
    } else if (isNewUser) {
      pushScreen('wizard', 'craftsman');
    } else {
      pushScreen('dashboard', 'craftsman');
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore
    }
    api.setToken(null);
    setCurrentUser(null);
    goHome();
  };

  return (
    <AndroidFrame onAndroidBack={goBack} onAndroidHome={goHome}>
      <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
        {/* Universal Sticky Top App Bar with Back Button (§User Request) */}
        <TopAppBar
          currentScreen={activeScreen}
          lang={lang}
          onBack={goBack}
          onHome={goHome}
          currentUser={currentUser}
          wizardStep={wizardStep}
          onOpenCraftsman={() => {
            if (!currentUser) {
              pushScreen('login', 'craftsman');
            } else if (currentUser.roles.includes('SUPER_ADMIN')) {
              pushScreen('superadmin', 'craftsman');
            } else if (currentUser.roles.includes('ADMIN')) {
              pushScreen('admin', 'craftsman');
            } else if (currentUser.roles.includes('AD_PARTNER')) {
              pushScreen('adpartner', 'craftsman');
            } else {
              pushScreen('dashboard', 'craftsman');
            }
          }}
        />

        {/* Dynamic Screen Viewport Container */}
        <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin">
          {activeScreen === 'main' && (
            <MainScreen
              lang={lang}
              onSearch={handleSearch}
              onOpenCraftsmanLogin={() => {
                if (!currentUser) {
                  pushScreen('login', 'craftsman');
                } else if (currentUser.roles.includes('SUPER_ADMIN')) {
                  pushScreen('superadmin', 'craftsman');
                } else if (currentUser.roles.includes('ADMIN')) {
                  pushScreen('admin', 'craftsman');
                } else if (currentUser.roles.includes('AD_PARTNER')) {
                  pushScreen('adpartner', 'craftsman');
                } else {
                  pushScreen('dashboard', 'craftsman');
                }
              }}
              onSelectCraftsman={handleSelectCraftsman}
            />
          )}

          {activeScreen === 'results' && (
            <SearchResultsScreen
              lang={lang}
              initialCityId={selectedCityId}
              initialProfessionId={selectedProfessionId}
              onBack={goBack}
              onSelectCraftsman={handleSelectCraftsman}
              onCall={handleCall}
            />
          )}

          {activeScreen === 'detail' && selectedCraftsman && (
            <CraftsmanDetailScreen
              craftsman={selectedCraftsman}
              lang={lang}
              onBack={goBack}
              onCall={handleCall}
            />
          )}

          {activeScreen === 'login' && (
            <LoginScreen
              lang={lang}
              onBack={goBack}
              onLoginSuccess={handleLoginSuccess}
              onOpenRegister={() => pushScreen('wizard', 'craftsman')}
            />
          )}

          {activeScreen === 'wizard' && (
            <RegistrationWizard
              lang={lang}
              step={wizardStep}
              onStepChange={setWizardStep}
              onCancel={goBack}
              onComplete={() => pushScreen('dashboard', 'craftsman')}
            />
          )}

          {activeScreen === 'dashboard' && currentUser && (
            <CraftsmanDashboard
              lang={lang}
              currentUser={currentUser}
              onBack={goBack}
              onOpenTop15Purchase={() => pushScreen('top15', 'craftsman')}
              onOpenSupportChat={() => pushScreen('chat', 'craftsman')}
              onLogout={handleLogout}
            />
          )}

          {activeScreen === 'top15' && (
            <Top15Screen
              lang={lang}
              onBack={goBack}
              onSuccess={() => pushScreen('dashboard', 'craftsman')}
            />
          )}

          {activeScreen === 'chat' && (
            <SupportChatScreen
              lang={lang}
              onBack={goBack}
            />
          )}

          {activeScreen === 'admin' && currentUser && (
            <AdminDashboard
              lang={lang}
              currentUser={currentUser}
              onBack={goBack}
              onOpenSuperAdmin={() => pushScreen('superadmin', 'craftsman')}
            />
          )}

          {activeScreen === 'superadmin' && currentUser && (
            <SuperAdminScreen
              lang={lang}
              currentUser={currentUser}
              onBack={goBack}
            />
          )}

          {activeScreen === 'adpartner' && currentUser && (
            <AdPartnerScreen
              lang={lang}
              currentUser={currentUser}
              onLogout={handleLogout}
              onBack={goBack}
            />
          )}

          {activeScreen === 'settings' && (
            <SettingsScreen
              lang={lang}
              onLanguageChange={handleLanguageChange}
              currentUser={currentUser}
              onLogout={handleLogout}
              onBack={goBack}
            />
          )}
        </div>

        {/* Global Bottom Navigation Bar */}
        <Navbar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          lang={lang}
          currentUser={currentUser}
        />

        {/* Android Native Dialer Modal Simulation (§3.2 & §3.4) */}
        {callingCraftsman && (
          <DialerModal
            craftsmanName={callingCraftsman.name}
            phone={callingCraftsman.phone}
            lang={lang}
            onClose={() => setCallingCraftsman(null)}
          />
        )}
      </div>
    </AndroidFrame>
  );
}


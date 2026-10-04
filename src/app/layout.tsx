import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { CloudRain, Home, Map, Sparkles, TrendingUp, AlertTriangle, Leaf, MapPin, Menu, Sun, Moon, Search, Bell, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/Command';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { BottomNav } from '@/components/ui/BottomNav';
import { useWeatherWebSocket } from '@/hooks/useWeatherWebSocket';

function NavLinks({ isMobile, onNavigate }: { isMobile?: boolean, onNavigate?: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();

  const NAV_GROUPS = [
    {
      label: 'MAIN',
      items: [
        { name: t('nav.dashboard', 'Dashboard'), path: '/', icon: Home },
        { name: t('nav.weathergpt', 'WeatherGPT'), path: '/weathergpt', icon: Sparkles, badge: 'AI' },
        { name: t('nav.forecast_intelligence', 'Forecast Intelligence'), path: '/forecast-intelligence', icon: Sparkles, badge: 'PRO' },
      ]
    },
    {
      label: 'WEATHER',
      items: [
        { name: t('nav.weather_map', 'Weather Map'), path: '/map', icon: Map },
        { name: t('nav.alerts', 'Alerts'), path: '/alerts', icon: AlertTriangle },
        { name: t('nav.climate', 'Climate'), path: '/climate', icon: CloudRain },
      ]
    },
    {
      label: 'LOCATIONS',
      items: [
        { name: t('nav.saved_locations', 'Saved Locations'), path: '/locations', icon: MapPin },
      ]
    }
  ];

  const primaryPaths = ['/', '/weathergpt', '/map'];

  return (
    <nav className={cn("px-3", isMobile ? "mt-6" : "flex-1 overflow-y-auto py-6")}>
      {NAV_GROUPS.map((group, idx) => {
        const filteredItems = isMobile 
          ? group.items.filter(item => !primaryPaths.includes(item.path))
          : group.items;

        if (filteredItems.length === 0) return null;

        return (
          <div key={group.label} className={cn("mb-4", idx === NAV_GROUPS.length - 1 ? "mb-0" : "")}>
            <p className="px-3 mb-1.5 text-[11px] font-bold tracking-widest text-sky-text-secondary uppercase">
              {group.label}
            </p>
            <div className="space-y-1">
              {filteredItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 overflow-hidden",
                      isActive 
                        ? "text-sky-primary bg-sky-surface-interactive border-l-[3px] border-sky-primary shadow-sm rounded-l-none rounded-r-xl" 
                        : "text-sky-text-secondary hover:text-sky-text-primary hover:bg-sky-surface-interactive/50 border-l-[3px] border-transparent rounded-r-xl"
                    )}
                  >
                    <div className="flex items-center">
                      <Icon className={cn(
                        "h-4.5 w-4.5 mr-3 transition-transform duration-300", 
                        isActive ? "text-sky-primary scale-110" : "text-sky-text-secondary group-hover:text-sky-text-primary group-hover:scale-110"
                      )} />
                      <span className="tracking-wide">{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-sm",
                        item.badge === 'AI' ? "bg-sky-ai/10 text-sky-ai" : "bg-sky-primary/10 text-sky-primary"
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('skycast_theme');
    if (saved) {
      return saved === 'dark';
    }
    return true; // Default to dark mode
  });
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(location.search);
  const activeCity = params.get('city') || 'Pune';

  // Enable Real-Time Weather & Alert Subscriptions
  const { connectionState, isConnected } = useWeatherWebSocket(activeCity);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Subscribe to query cache to get real-time temp/stale status for the header
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey[0] === 'weather' && 
        event.query.queryKey[1] === 'dashboard' && 
        event.query.queryKey[2] === activeCity &&
        event.type === 'updated'
      ) {
        setDashboardData(event.query.state.data);
      }
    });
    
    // Initial load
    const initialData = queryClient.getQueryData(['weather', 'dashboard', activeCity]);
    if (initialData) setDashboardData(initialData);

    return () => unsubscribe();
  }, [activeCity, queryClient]);

  const isStale = dashboardData?.meta?.is_stale === true;
  const currentTemp = dashboardData?.current?.tempC !== undefined ? Math.round(dashboardData.current.tempC) : '--';
  const currentCond = dashboardData?.current?.condition || 'Clear';

  const [activeAlert, setActiveAlert] = useState<any>(null);

  useEffect(() => {
    const handleAlert = (e: any) => {
      const { type, alert } = e.detail;
      if (['alert.created', 'alert.updated'].includes(type)) {
        setActiveAlert(alert);
        setTimeout(() => setActiveAlert(null), 8000); // Auto-hide after 8s
      } else if (type === 'alert.resolved') {
        setActiveAlert({ ...alert, resolved: true });
        setTimeout(() => setActiveAlert(null), 5000);
      }
    };
    window.addEventListener('weather-alert-transition', handleAlert);
    return () => window.removeEventListener('weather-alert-transition', handleAlert);
  }, []);

  const handleLocationSelect = (city: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    navigate(`${location.pathname}?city=${encodeURIComponent(city)}`);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem('skycast_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <div className="flex h-dvh w-full bg-sky-background overflow-hidden text-sky-text-primary font-sans antialiased">
      <aside className="hidden lg:flex w-64 flex-col bg-sky-sidebar border-r border-sky-border z-20 transition-all duration-300">
        <div className="flex h-16 items-center px-6">
          <div className="bg-linear-to-tr from-sky-primary to-sky-ai p-2.5 rounded-xl shadow-md mr-3">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-sky-text-primary">{t('layout.skycast', 'SkyCast')}</span>
            <span className="block text-[11px] text-sky-ai font-bold tracking-[0.2em] uppercase -mt-0.5">{t('layout.intelligence', 'Intelligence')}</span>
          </div>
        </div>
        
        <NavLinks />

        <div className="p-4 pb-3">
           <button onClick={toggleTheme} className="flex w-full items-center justify-between px-3 py-2 text-[13px] text-sky-text-secondary hover:text-sky-text-primary rounded-lg hover:bg-sky-surface-interactive transition-all duration-300 group border border-transparent hover:border-sky-border">
              <span className="font-semibold tracking-wide">{t('layout.toggle_theme', 'Toggle Theme')}</span>
              <div className="bg-sky-surface-interactive p-1.5 rounded-lg group-hover:shadow-sm transition-all">
                <Sun className="h-4 w-4 block dark:hidden text-amber-500" />
                <Moon className="h-4 w-4 hidden dark:block text-sky-primary" />
              </div>
           </button>
        </div>
        <div className="p-4 pt-0 mt-auto border-t border-sky-border/50">
           <div className="mt-3 flex flex-col gap-1 text-xs">
             <span className="font-bold text-sky-text-primary text-[13px] flex items-center"><MapPin className="h-3.5 w-3.5 mr-1 text-sky-primary"/> {activeCity.charAt(0).toUpperCase() + activeCity.slice(1)}</span>
             <span className="text-sky-text-secondary flex items-center mt-1">{currentTemp}° · {currentCond}</span>
             <span className={cn(
               "mt-2 text-[10px] uppercase font-bold tracking-wider",
               isStale ? "text-amber-500" : isConnected ? "text-emerald-500" : "text-sky-text-muted"
             )}>
               ● {isStale ? "Stale Data" : isConnected ? "Live" : "Connecting..."}
             </span>
           </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-sky-background">
        <header className="h-14 bg-sky-header border-b border-sky-border flex items-center justify-between px-4 lg:px-6 z-10 shrink-0 sticky top-0 shadow-sm">
          <div className="flex items-center lg:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="mr-3">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-75 p-0 flex flex-col bg-sky-surface/95 backdrop-blur-2xl border-r border-sky-border">
                <div className="flex h-20 items-center px-8 border-b border-sky-border">
                  <div className="bg-linear-to-tr from-sky-primary to-sky-ai p-2 rounded-xl shadow-md mr-3">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xl font-bold tracking-tight">{t('layout.skycast', 'SkyCast')}</span>
                </div>
                <NavLinks isMobile onNavigate={() => setIsMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="bg-linear-to-tr from-sky-primary to-sky-ai p-1.5 rounded-lg shadow-sm mr-2">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">{t('layout.skycast', 'SkyCast')}</span>
          </div>

          <div className="hidden lg:flex flex-1 items-center gap-6 max-w-xl">
             <button 
                onClick={() => setIsSearchOpen(true)}
                className="group flex items-center gap-2 px-3 py-1.5 text-[13px] text-sky-text-secondary bg-sky-surface-interactive hover:bg-sky-surface border border-sky-border hover:border-sky-primary/50 rounded-lg transition-all w-full shadow-sm"
             >
                <Search className="h-4 w-4 text-sky-text-secondary group-hover:text-sky-primary transition-colors" />
                <span className="font-medium">{t('layout.search_locations', 'Search locations...')}</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-sky-surface-elevated px-1.5 font-mono text-[10px] font-bold text-sky-text-secondary border border-sky-border">
                  ⌘ K
                </kbd>
             </button>
          </div>

          <div className="hidden lg:flex flex-1 justify-center items-center gap-4 text-sm">
             <span className="font-semibold text-sky-text-primary">{activeCity.charAt(0).toUpperCase() + activeCity.slice(1)}</span>
             <span className="text-sky-text-muted text-xs">·</span>
             <span className={cn(
               "text-xs font-medium px-2 py-0.5 rounded-full",
               isStale ? "bg-amber-500/10 text-amber-500" : isConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-sky-surface-interactive text-sky-text-secondary"
             )}>
               {isStale ? "Using cached data" : isConnected ? "Live Connection" : "Connecting..."}
             </span>
          </div>

          <div className="flex items-center gap-3">
             <Button variant="ghost" size="icon" onClick={() => setIsSearchOpen(true)} className="lg:hidden rounded-full hover:bg-sky-surface-elevated">
                <Search className="h-5 w-5" />
             </Button>
             <Button variant="ghost" size="icon" className="hidden sm:inline-flex relative rounded-full hover:bg-sky-surface-elevated transition-transform hover:scale-105">
                <Bell className="h-5 w-5 text-sky-text-secondary" />
                <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-sky-danger border-2 border-sky-surface animate-pulse"></span>
             </Button>

             <Dialog>
               <DialogTrigger asChild>
                 <Button variant="ghost" size="icon" className="rounded-full hover:bg-sky-surface-elevated transition-transform hover:scale-105">
                    <Settings className="h-5 w-5 text-sky-text-secondary" />
                 </Button>
               </DialogTrigger>
               <DialogContent className="sm:max-w-106.25">
                 <DialogHeader>
                   <DialogTitle>{t('layout.settings', 'Settings')}</DialogTitle>
                   <DialogDescription>
                     {t('layout.settings_desc', 'Manage your application preferences here.')}
                   </DialogDescription>
                 </DialogHeader>
                 <div className="grid gap-4 py-4">
                   <div className="flex flex-col gap-2">
                     <h3 className="font-medium text-sky-text-primary">{t('layout.theme', 'Theme')}</h3>
                     <div className="flex items-center justify-between p-3 rounded-lg border border-sky-border bg-sky-surface-elevated/30">
                       <span className="text-sm text-sky-text-secondary">{t('layout.toggle_dark_mode', 'Toggle Dark Mode')}</span>
                       <Button variant="outline" size="sm" onClick={toggleTheme}>{t('layout.toggle', 'Toggle')}</Button>
                     </div>
                   </div>
                   <div className="flex flex-col gap-2">
                     <h3 className="font-medium text-sky-text-primary">{t('layout.units', 'Units')}</h3>
                     <div className="flex items-center justify-between p-3 rounded-lg border border-sky-border bg-sky-surface-elevated/30">
                       <span className="text-sm text-sky-text-secondary">{t('layout.temperature_unit', 'Temperature Unit')}</span>
                       <div className="flex bg-sky-surface rounded-md border border-sky-border p-0.5">
                         <button className="px-3 py-1 text-xs font-semibold rounded bg-sky-primary text-white">{t('layout.celsius', '°C')}</button>
                         <button className="px-3 py-1 text-xs font-semibold rounded text-sky-text-secondary hover:text-sky-text-primary">{t('layout.fahrenheit', '°F')}</button>
                       </div>
                     </div>
                   </div>
                   <div className="flex flex-col gap-2">
                     <h3 className="font-medium text-sky-text-primary">{t('layout.language', 'Language')}</h3>
                     <div className="flex items-center justify-between p-3 rounded-lg border border-sky-border bg-sky-surface-elevated/30">
                       <span className="text-sm text-sky-text-secondary">{t('layout.application_language', 'Application Language')}</span>
                       <LanguageSwitcher />
                     </div>
                   </div>
                 </div>
               </DialogContent>
             </Dialog>

             <div className="h-9 w-9 rounded-full bg-linear-to-tr from-sky-primary to-sky-ai ml-2 flex items-center justify-center text-white font-bold text-sm shadow-md cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 border-sky-surface">
                U
             </div>
          </div>
        </header>

        <CommandDialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <CommandInput 
            placeholder={t('layout.search_placeholder', 'Search locations, forecasts, or ask AI...')} 
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="text-lg"
          />
          <CommandList className="p-2">
            <CommandEmpty className="py-6 text-center text-sky-text-secondary">{t('layout.no_results', 'No results found.')}</CommandEmpty>
            
            {searchQuery.trim().length > 0 && (
              <CommandGroup heading={t('layout.search', 'Search')} className="px-2">
                <CommandItem onSelect={() => handleLocationSelect(searchQuery.trim())} className="rounded-lg cursor-pointer">
                  <Search className="mr-3 h-4 w-4 text-sky-primary" />
                  <span className="font-medium">{t('layout.get_weather_for', 'Get weather for')} <span className="text-sky-primary font-bold">"{searchQuery.trim()}"</span></span>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading={t('layout.explore_weather', 'Explore Diverse Weather')} className="px-2">
              <CommandItem onSelect={() => handleLocationSelect('Yakutsk')} className="rounded-lg cursor-pointer my-1">
                <MapPin className="mr-3 h-4 w-4 text-sky-400" />
                <span className="font-medium">Yakutsk, Russia <span className="text-sky-text-secondary text-xs ml-2">(Extreme Cold / Snow)</span></span>
              </CommandItem>
              <CommandItem onSelect={() => handleLocationSelect('Death Valley')} className="rounded-lg cursor-pointer my-1">
                <MapPin className="mr-3 h-4 w-4 text-orange-500" />
                <span className="font-medium">Death Valley, USA <span className="text-sky-text-secondary text-xs ml-2">(Extreme Heat / Clear)</span></span>
              </CommandItem>
              <CommandItem onSelect={() => handleLocationSelect('Cherrapunji')} className="rounded-lg cursor-pointer my-1">
                <MapPin className="mr-3 h-4 w-4 text-blue-500" />
                <span className="font-medium">Cherrapunji, India <span className="text-sky-text-secondary text-xs ml-2">(Heavy Rain)</span></span>
              </CommandItem>
              <CommandItem onSelect={() => handleLocationSelect('London')} className="rounded-lg cursor-pointer my-1">
                <MapPin className="mr-3 h-4 w-4 text-slate-400" />
                <span className="font-medium">London, UK <span className="text-sky-text-secondary text-xs ml-2">(Cloudy / Fog)</span></span>
              </CommandItem>
              <CommandItem onSelect={() => handleLocationSelect('Pune')} className="rounded-lg cursor-pointer my-1">
                <MapPin className="mr-3 h-4 w-4 text-emerald-500" />
                <span className="font-medium">Pune, India <span className="text-sky-text-secondary text-xs ml-2">(Current Location)</span></span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading={t('layout.quick_actions', 'Quick Actions')} className="px-2">
              <CommandItem onSelect={() => { setIsSearchOpen(false); navigate('/weathergpt'); }} className="rounded-lg cursor-pointer my-1 bg-sky-ai/5">
                <Sparkles className="mr-3 h-4 w-4 text-sky-ai" />
                <span className="text-sky-ai font-bold">{t('layout.ask_weathergpt', 'Ask WeatherGPT')}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <div className="flex-1 overflow-y-auto hide-scrollbar relative z-0 lg:pb-0 pb-16">
          <Outlet />
        </div>
        <BottomNav />
        
        {/* Real-time Alert Toast Notification */}
        {activeAlert && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 lg:bottom-10 lg:left-auto lg:right-10 lg:translate-x-0 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className={cn(
              "flex flex-col gap-1 p-4 rounded-xl shadow-lg border-l-4 w-[320px]",
              activeAlert.resolved ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300" :
              activeAlert.tier === 'red' ? "bg-red-500/10 border-red-500 text-red-700 dark:text-red-300" :
              activeAlert.tier === 'orange' ? "bg-orange-500/10 border-orange-500 text-orange-700 dark:text-orange-300" :
              "bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-300"
            )}>
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {activeAlert.resolved ? "Alert Resolved" : "New Weather Alert"}
                </span>
                <button onClick={() => setActiveAlert(null)} className="opacity-70 hover:opacity-100">✕</button>
              </div>
              <p className="font-semibold text-sm mt-1">{activeAlert.hazard}</p>
              {activeAlert.description && <p className="text-xs opacity-90 line-clamp-2 mt-0.5">{activeAlert.description}</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

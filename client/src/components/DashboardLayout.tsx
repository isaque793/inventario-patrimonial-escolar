import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { getNavigationItemsForRole } from "@/lib/roleNavigation";
import { activateTutorial, isTutorialComplete, restartTutorial, TUTORIAL_ACTIVE_KEY } from "@/lib/tutorialSandbox";
import { BarChart3, Building2, ClipboardList, GraduationCap, LogOut, PanelLeft, ShieldCheck } from "lucide-react";
import React, { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import GuidedTutorial from "./GuidedTutorial";

const SIDEBAR_WIDTH_KEY = "inventario-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 220;
const MAX_WIDTH = 370;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { loading, user } = useAuth();

  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()); }, [sidebarWidth]);
  useEffect(() => {
    if (!user || user.role === "admin") {
      setTutorialOpen(false);
      return;
    }
    setTutorialOpen(!isTutorialComplete());
  }, [user]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="min-h-screen bg-[#f4f6f2] px-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[2rem] border border-[#d9e3d5] bg-white p-9 text-center shadow-[0_18px_70px_rgba(18,54,41,.10)]">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#0c4a3e] text-white"><ShieldCheck className="size-7" /></div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#16382e]">Acesso ao inventário</h1>
        <p className="mt-3 text-sm leading-6 text-[#617067]">Entre para aceder ao espaço da sua escola ou ao painel de acompanhamento da equipa gestora.</p>
        <Button onClick={() => (window.location.href = "/login")} className="mt-7 w-full bg-[#0c4a3e] hover:bg-[#083a31]">Iniciar sessão</Button>
      </div>
    </div>;
  }

  if (tutorialOpen) activateTutorial();
  else localStorage.removeItem(TUTORIAL_ACTIVE_KEY);

  const reopenTutorial = () => {
    restartTutorial();
    setTutorialOpen(true);
  };

  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth} onReopenTutorial={reopenTutorial}>{children}</DashboardLayoutContent>{tutorialOpen && <GuidedTutorial />}</SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth, onReopenTutorial }: { children: React.ReactNode; setSidebarWidth: (width: number) => void; onReopenTutorial: () => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCollapsed = state === "collapsed";
  const iconByName = { management: BarChart3, schools: Building2, administrators: ShieldCheck, inventory: ClipboardList };
  const menuItems = getNavigationItemsForRole(user?.role).map(item => ({ ...item, icon: iconByName[item.icon] }));
  const activeLabel = menuItems.find(item => item.path === location)?.label ?? "Inventário";

  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    if (isResizing) { document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; }
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
  }, [isResizing, setSidebarWidth]);

  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r border-[#20463c]/10 bg-[#0b332b] text-[#edf5ef]" disableTransition={isResizing}>
        <SidebarHeader className="h-[84px] justify-center px-3">
          <div className="flex items-center gap-3 px-1">
            <button onClick={toggleSidebar} aria-label="Alternar navegação" className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[#bed6c7] hover:bg-white/10 hover:text-white"><PanelLeft className="size-4" /></button>
            {!isCollapsed && <div className="min-w-0"><p className="font-serif text-[17px] font-semibold leading-none tracking-tight text-white">Patrimônio Escolar</p><p className="mt-1.5 text-[10px] font-medium uppercase tracking-[.17em] text-[#a7c5b3]">Inventário anual</p></div>}
          </div>
        </SidebarHeader>
        <SidebarContent className="pt-4">
          <SidebarMenu className="space-y-1 px-3">{menuItems.map(item => <SidebarMenuItem key={item.path}>
            <SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={!isMobile && isCollapsed ? item.label : undefined} className="h-11 rounded-xl text-[#c4d8cd] hover:bg-white/10 hover:text-white data-[active=true]:bg-[#d9c07c] data-[active=true]:text-[#17372f]">
              <item.icon className="size-[18px]" /><span className="font-medium">{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3">
          <DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c07c]">
            <Avatar className="size-9 border border-white/10"><AvatarFallback className="bg-[#255c4b] text-xs font-semibold text-white">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar>
            {!isCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user?.name || "Utilizador"}</p><p className="mt-0.5 truncate text-xs text-[#aac6b6]">{user?.role === "admin" ? "Equipa gestora" : "Escola"}</p></div>}
          </button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48">{user?.role !== "admin" && <DropdownMenuItem onClick={onReopenTutorial} className="cursor-pointer"><GraduationCap className="mr-2 size-4" />Ver tutorial novamente</DropdownMenuItem>}
            <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 size-4" />Terminar sessão</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      {!isMobile && !isCollapsed && <div className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-[#d9c07c]/60" onMouseDown={() => setIsResizing(true)} />}
    </div>
    <SidebarInset className="min-w-0 max-w-full overflow-x-clip bg-[#f5f7f3]">{isMobile && <div className="sticky top-0 z-40 w-full min-w-0 border-b border-[#dce6df] bg-[#f5f7f3]/95 px-3 py-2 backdrop-blur sm:px-4"><div className="flex h-10 items-center"><SidebarTrigger className="mr-3" /><span className="font-semibold text-[#17372f]">{activeLabel}</span></div><nav aria-label="Navegação móvel" className="-mx-1 flex min-w-0 gap-2 overflow-x-auto pb-1 pt-1 [scrollbar-width:none]">{menuItems.map(item => <button key={item.path} onClick={() => setLocation(item.path)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${location === item.path ? "bg-[#0c4a3e] text-white" : "bg-white text-[#456356] ring-1 ring-[#dce7dc]"}`}>{item.label}</button>)}</nav></div>}<main className="min-h-screen w-full min-w-0 p-3 sm:p-4 md:p-7">{children}</main></SidebarInset>
  </>;
}

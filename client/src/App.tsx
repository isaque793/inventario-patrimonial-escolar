import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import React, { Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useAuth } from "./_core/hooks/useAuth";
import DashboardLayout from "./components/DashboardLayout";
import { AdminGuard } from "./components/AdminGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Cada página vira um arquivo separado: o navegador só baixa a que o usuário abre.
const AdminUsers = React.lazy(() => import("./pages/AdminUsers"));
const AccessRequests = React.lazy(() => import("./pages/AccessRequests"));
const Home = React.lazy(() => import("./pages/Home"));
const Login = React.lazy(() => import("./pages/Login"));
const ForgotPassword = React.lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const Management = React.lazy(() => import("./pages/ManagementExcel"));
const ManagementReview = React.lazy(() => import("./pages/ManagementReview"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Validation = React.lazy(() => import("./pages/Validation"));
const PageFallback = () => <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Carregando...</div>;

function HomeRoute() { const { user } = useAuth(); return user?.role === "manager" ? <Redirect to="/gestao" /> : <Home />; }
function OfficialInventoryRoute() { const { user } = useAuth(); return user?.role === "manager" ? <Redirect to="/gestao" /> : <Home />; }
function ManagementRoute() { return <AdminGuard allowManager><Management /></AdminGuard>; }
function ValidationRoute() { return <AdminGuard allowManager><Validation /></AdminGuard>; }
function ManagementReviewRoute() { return <AdminGuard allowManager><ManagementReview /></AdminGuard>; }
function AdministratorsRoute() { return <AdminGuard><AdminUsers /></AdminGuard>; }
function AccessRequestsRoute() { return <AdminGuard allowManager><AccessRequests /></AdminGuard>; }
function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/esqueci-senha" component={ForgotPassword} />
      <Route path="/redefinir-senha" component={ResetPassword} />
      <Route>
        <DashboardLayout>
          <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/inventario" component={OfficialInventoryRoute} />
            <Route path="/gestao" component={ManagementRoute} />
            <Route path="/validacao" component={ValidationRoute} />
            <Route path="/gestao/analise/:cycleId" component={ManagementReviewRoute} />
            <Route path="/administradores" component={AdministratorsRoute} />
            <Route path="/solicitacoes-acesso" component={AccessRequestsRoute} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
          </Suspense>
        </DashboardLayout>
      </Route>
    </Switch>
    </Suspense>
  );
}
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }

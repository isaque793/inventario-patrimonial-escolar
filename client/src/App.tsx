import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import React from "react";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import { AdminGuard } from "./components/AdminGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminUsers from "./pages/AdminUsers";
import AccessRequests from "./pages/AccessRequests";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Management from "./pages/ManagementExcel";
import ManagementReview from "./pages/ManagementReview";
import NotFound from "./pages/NotFound";

function ManagementRoute() { return <AdminGuard><Management /></AdminGuard>; }
function ManagementReviewRoute() { return <AdminGuard><ManagementReview /></AdminGuard>; }
function AdministratorsRoute() { return <AdminGuard><AdminUsers /></AdminGuard>; }
function AccessRequestsRoute() { return <AdminGuard><AccessRequests /></AdminGuard>; }
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/esqueci-senha" component={ForgotPassword} />
      <Route path="/redefinir-senha" component={ResetPassword} />
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/gestao" component={ManagementRoute} />
            <Route path="/gestao/analise/:cycleId" component={ManagementReviewRoute} />
            <Route path="/administradores" component={AdministratorsRoute} />
            <Route path="/solicitacoes-acesso" component={AccessRequestsRoute} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }

import { Routes, Route } from "react-router";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { I18nProvider, useI18n } from "@/i18n";
import { SessionProvider } from "@/mock/session";
import { ToastProvider } from "@/components/ui/Toast";
import Layout from "@/components/Layout";
import { RoleGuard } from "@/components/RoleGuard";
import Login from "@/pages/auth/Login";
import ResetPassword from "@/pages/auth/ResetPassword";
import PageStub from "@/pages/PageStub";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminLinks from "@/pages/admin/AdminLinks";
import AdminLinkDetail from "@/pages/admin/AdminLinkDetail";
import AdminAccounts from "@/pages/admin/AdminAccounts";
import AdminAccountDetail from "@/pages/admin/AdminAccountDetail";
import AdminSettings from "@/pages/admin/AdminSettings";
import MerchantDashboard from "@/pages/merchant/MerchantDashboard";
import MerchantOrders from "@/pages/merchant/MerchantOrders";
import MerchantOrderDetail from "@/pages/merchant/MerchantOrderDetail";
import LinksDirectory from "@/pages/links/LinksDirectory";
import LinkCreate from "@/pages/links/LinkCreate";
import LinkDetail from "@/pages/links/LinkDetail";
import LinkEdit from "@/pages/links/LinkEdit";
import LinkOrders from "@/pages/links/LinkOrders";
import LinkOrderDetail from "@/pages/links/LinkOrderDetail";
import CatalogPage from "@/pages/catalog/CatalogPage";
import ProductNewPage from "@/pages/catalog/ProductNewPage";
import ProductDetailPage from "@/pages/catalog/ProductDetailPage";
import CategoriesPage from "@/pages/catalog/CategoriesPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import CheckoutPage from "@/pages/checkout/CheckoutPage";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <SessionProvider>
          <ToastWithLabels>{children}</ToastWithLabels>
        </SessionProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function ToastWithLabels({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <ToastProvider retryLabel={t("common.retry")}>{children}</ToastProvider>;
}

export default function App() {
  return (
    <Providers>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public checkout */}
        <Route path="/pay/:identifier" element={<CheckoutPage />} />

        {/* Admin area — ADMIN only */}
        <Route element={<RoleGuard allow="ADMIN" />}>
          <Route element={<Layout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/orders/:id" element={<AdminOrderDetail kind="v1" />} />
            <Route path="/admin/orders/v2/:id" element={<AdminOrderDetail kind="v2" />} />
            <Route path="/admin/payment-links" element={<AdminLinks />} />
            <Route path="/admin/payment-links/v2/:id" element={<AdminLinkDetail />} />
            <Route path="/admin/accounts" element={<AdminAccounts />} />
            <Route path="/admin/accounts/:id" element={<AdminAccountDetail />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
          </Route>
        </Route>

        {/* Merchant area — USER only */}
        <Route element={<RoleGuard allow="USER" />}>
          <Route element={<Layout />}>
            <Route path="/" element={<MerchantDashboard />} />
            <Route path="/orders" element={<MerchantOrders />} />
            <Route path="/orders/:id" element={<MerchantOrderDetail kind="v1" />} />
            <Route path="/orders/v2/:id" element={<MerchantOrderDetail kind="v2" />} />
            <Route path="/links" element={<LinksDirectory />} />
            <Route path="/links/new" element={<LinkCreate />} />
            <Route path="/links/v2/:id" element={<LinkDetail />} />
            <Route path="/links/v2/:id/edit" element={<LinkEdit />} />
            <Route path="/links/v2/:id/orders" element={<LinkOrders />} />
            <Route path="/links/v2/:id/orders/:orderId" element={<LinkOrderDetail />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/catalog/products/new" element={<ProductNewPage />} />
            <Route path="/catalog/products/:id" element={<ProductDetailPage />} />
            <Route path="/catalog/categories" element={<CategoriesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<PageStub />} />
      </Routes>
    </Providers>
  );
}

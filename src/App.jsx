import React, { useState, useEffect } from 'react';
import {
  Routes, Route, Navigate, useNavigate, useLocation, Outlet, useParams
} from 'react-router-dom';

// ── Page component imports ────────────────────────────────────────────────────
import VisualRecPage from './components/VisualRec/VisualRecPage';
import SellerPage from './components/Seller/SellerPage';
import SellerAuthPage from './components/Seller/SellerAuthPage';
import SellerDashboard from './components/Seller/SellerDashboard';
import ProductList from './components/Seller/ProductList';
import SellerFinancialProj from './components/Seller/SellerFinancialProjection';
import MarketplacePage from './components/Marketplace/MarketplacePage';
import ProductDetailPage from './components/Marketplace/ProductDetailPage';
import ThriftHomePage from './components/Thrift/ThriftHomePage';
import DowryPage from './components/Dowry/DowryPage';
import BuyerAuthPage from './components/Buyer/BuyerAuthPage';
import BuyerDashboard from './components/Buyer/BuyerDashboard';
import FinalProjection from './components/Buyer/FinalProjection';
import CartDrawer from './components/Cart/CartDrawer';
import LandingPage from './components/LandingPage';
import AdminLogin from './components/Admin/AdminLogin';
import AdminLayout from './components/Admin/AdminLayout';
import FinancialDashboard from './components/Admin/FinancialDashboard';
import SellerManagement from './components/Admin/SellerManagement';
import BuyerManagement from './components/Admin/BuyerManagement';
import CategoryManager from './components/Admin/CategoryManager';
import OrdersPage from './components/Admin/OrdersPage';
import AdminDisputesPage from './components/Admin/AdminDisputesPage';
import AdminWalletPage from './components/Admin/AdminWalletPage';
import AdminBnplRepaymentsPage from './components/Admin/AdminBnplRepaymentsPage';
import CheckoutPage from './components/Cart/CheckoutPage';
import BuyerOrdersPage from './components/Orders/BuyerOrdersPage';
import BuyerOrderDetailPage from './components/Orders/BuyerOrderDetailPage';
import BNPLApplyPage from './components/BNPL/BNPLApplyPage';
import BNPLStatusPage from './components/BNPL/BNPLStatusPage';
import SellerOrdersPage from './components/Seller/SellerOrdersPage';
import SellerOrderDetailPage from './components/Seller/SellerOrderDetailPage';
import BankLoginPage from './components/Bank/BankLoginPage';
import BankDashboardPage from './components/Bank/BankDashboardPage';
import DisputeChatPage from './components/Disputes/DisputeChatPage';
import SellerReviewsPage from './components/Seller/SellerReviewsPage';
import AdminReviewsPage from './components/Admin/AdminReviewsPage';
import NotificationBell from './components/Common/NotificationBell';
import NavBadge from './components/Common/NavBadge';
import { useNotifications, NAV_BADGE_TYPES } from './hooks/useNotifications';
import GlobalSearch from './components/Common/GlobalSearch';
import { listBuyerOrders } from './api/orderApi';
import { CartProvider, useCart } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import RequireRole, { AuthLoading } from './auth/RequireRole';
import { ROLE_HOME, postLoginPath } from './auth/guard';
import ChangePasswordPanel from './components/Common/ChangePasswordPanel';
import EmailVerificationBanner from './components/Common/EmailVerificationBanner';
import ForgotPasswordPage from './components/Auth/ForgotPasswordPage';
import ResetPasswordPage from './components/Auth/ResetPasswordPage';
import VerifyEmailPage from './components/Auth/VerifyEmailPage';
import {
  LayoutDashboard, ShoppingBag, Camera, Calculator, TrendingUp, User,
  ShoppingCart, PlusCircle, Package, LineChart, Star
} from 'lucide-react';
import logo from './assets/ShaadiSahulat Logo PNG.png';
import BuyerPageHero from './components/Common/BuyerPageHero';
import accountHeroImg from './assets/hero/Buyer_Account.jpg';

// ── Auth ──────────────────────────────────────────────────────────────────────
// Session state lives in src/context/AuthContext.jsx (JWT + HttpOnly refresh cookie).
// Re-exported here so existing imports of { useAuth } from '../../App' keep working.
export { useAuth };


// ── Level helpers ─────────────────────────────────────────────────────────────

function getBuyerLevel(orders = 0) {
  if (orders >= 7) return { level: 3, label: 'Loyal Buyer', color: 'from-teal-500 to-green-500', next: null, nextAt: null };
  if (orders >= 3) return { level: 2, label: 'Active Buyer', color: 'from-[#a37b3d] to-[#ECD4A8]', next: 3, nextAt: 7, progress: (orders - 3) / 4 };
  return { level: 1, label: 'New Buyer', color: 'from-[#c09858] to-[#ECD4A8]', next: 2, nextAt: 3, progress: orders / 3 };
}

function getSellerLevel(orders = 0) {
  if (orders >= 50) return { level: 3, label: 'Elite Seller', color: 'from-amber-500 to-orange-500', next: null, nextAt: null };
  if (orders >= 10) return { level: 2, label: 'Trusted Seller', color: 'from-blue-500 to-teal-500', next: 3, nextAt: 50, progress: (orders - 10) / 40 };
  return { level: 1, label: 'Starter Seller', color: 'from-[#ECD4A8] to-[#a37b3d]', next: 2, nextAt: 10, progress: orders / 10 };
}

function LevelBadge({ level, label, colorClass }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold text-white bg-gradient-to-r ${colorClass}`}>
      L{level} · {label}
    </span>
  );
}

function LevelProgress({ info, ordersLabel }) {
  if (!info.next) return <p className="text-xs text-gray-400 mt-1">Max level achieved</p>;
  const pct = Math.round((info.progress || 0) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{ordersLabel} · progress to L{info.next}</span>
        <span>{pct}% ({info.nextAt} needed)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full bg-gradient-to-r ${info.color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Account views ─────────────────────────────────────────────────────────────

function BuyerAccountView({ buyer }) {
  const [realOrderCount, setRealOrderCount] = useState(buyer?.orders_count || 0);

  useEffect(() => {
    if (buyer?.buyer_id) {
      listBuyerOrders(buyer.buyer_id)
        .then(res => {
          if (res?.success && Array.isArray(res.orders)) {
            setRealOrderCount(res.orders.length);
          }
        })
        .catch(() => { });
    }
  }, [buyer?.buyer_id]);

  const levelInfo = getBuyerLevel(realOrderCount);
  const joined = buyer?.created_at
    ? new Date(buyer.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' })
    : 'Recently';

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
      <BuyerPageHero
        badge={<><User size={13} /> My Account</>}
        title="Buyer Profile & Preferences"
        subtitle="Manage your bridal portal identity, contact details, and VIP milestone progress."
        image={accountHeroImg}
        imageAlt="Elegant bridal vanity account mood"
      />

      {/* Profile Card */}
      <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-[#EFEAE4]">
          <div className="w-20 h-20 bg-gradient-to-br from-[#1C1814] to-[#362A1F] border-2 border-[#9B7036] rounded-2xl flex items-center justify-center text-[#ECD4A8] text-3xl font-serif font-bold shrink-0 shadow-luxury overflow-hidden relative">
            <img src={accountHeroImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
            <span className="relative z-10">{buyer?.name?.[0]?.toUpperCase() || 'B'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-2xl font-serif font-bold text-gray-900 truncate">{buyer?.name}</h2>
              <span className="text-[10px] uppercase font-bold tracking-widest px-3 py-0.5 rounded-full bg-[#FAF3E8] text-[#9B7036] border border-[#ECD4A8]/60">
                {levelInfo.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-light truncate">{buyer?.email}</p>
            {buyer?.cnic && (
              <p className="text-[11px] font-mono text-gray-400 mt-1">Verified CNIC: {buyer.cnic}</p>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#FAF7F2] rounded-xl p-3.5 border border-[#EFEAE4]">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Contact Phone</p>
            <p className="font-semibold text-gray-900">{buyer?.phone || 'Not provided'}</p>
          </div>
          <div className="bg-[#FAF7F2] rounded-xl p-3.5 border border-[#EFEAE4]">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">City / Region</p>
            <p className="font-semibold text-gray-900">{buyer?.city || 'Pakistan'}</p>
          </div>
          <div className="bg-[#FAF7F2] rounded-xl p-3.5 border border-[#EFEAE4]">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Member Since</p>
            <p className="font-semibold text-gray-900">{joined}</p>
          </div>
          <div className="bg-[#FAF7F2] rounded-xl p-3.5 border border-[#EFEAE4]">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Commissions</p>
            <p className="font-serif font-bold text-[#9B7036] text-base">{realOrderCount}</p>
          </div>
        </div>
      </div>

      {/* VIP Tier & Loyalty Card */}
      <div className="bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-6 sm:p-8 space-y-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#9B7036] bg-[#FAF3E8] px-2.5 py-0.5 rounded-full border border-[#ECD4A8]/40">
            Privilege Program
          </span>
          <h3 className="text-lg font-serif font-bold text-gray-900 mt-1.5 mb-0.5">VIP Bridal Tier & Milestone Status</h3>
          <p className="text-xs text-gray-500 font-light">Unlock priority artisan dispatch and exclusive preview invites with each completed order.</p>
        </div>

        <div className="pt-2">
          <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
          <LevelProgress info={levelInfo} ordersLabel={`${realOrderCount} order${realOrderCount !== 1 ? 's' : ''}`} />
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-center pt-2">
          {[
            { l: 1, label: 'Standard Tier', at: 'Registered Member' },
            { l: 2, label: 'Silver Concierge', at: '3+ Orders' },
            { l: 3, label: 'Gold Haute Couture', at: '7+ Orders' },
          ].map(({ l, label, at }) => (
            <div
              key={l}
              className={`rounded-xl p-3.5 border transition-all ${
                levelInfo.level >= l
                  ? 'bg-[#FAF3E8] border-[#ECD4A8] text-[#4A3B2C] shadow-xs'
                  : 'bg-[#FAF7F2] border-[#EFEAE4] text-gray-400'
              }`}
            >
              <p className="text-xs font-serif font-bold text-[#9B7036]">Level 0{l}</p>
              <p className="font-bold text-xs mt-0.5 text-gray-900">{label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{at}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SellerAccountView({ seller }) {
  const orders = seller?.completed_orders || seller?.orders_count || 0;
  const levelInfo = getSellerLevel(orders);
  const joined = seller?.created_at
    ? new Date(seller.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' })
    : 'Recently';
  const maxListings = seller?.max_listings ?? (seller?.seller_type === 'company' ? '∞' : 5);

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {seller?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{seller?.name}</h2>
            <p className="text-sm text-gray-400 truncate">{seller?.email}</p>
            {seller?.seller_id && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{seller.seller_id}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {seller?.phone && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Phone</p>
              <p className="font-semibold text-gray-700">{seller.phone}</p>
            </div>
          )}
          {seller?.city && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">City</p>
              <p className="font-semibold text-gray-700">📍 {seller.city}</p>
            </div>
          )}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Member Since</p>
            <p className="font-semibold text-gray-700">{joined}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Orders Done</p>
            <p className="font-semibold text-gray-700">{orders}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Seller Type</p>
            <p className="font-semibold text-gray-700 capitalize">{seller?.seller_type || 'Individual'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Max Listings</p>
            <p className="font-semibold text-gray-700">{maxListings}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Seller Level</h3>
        <LevelBadge level={levelInfo.level} label={levelInfo.label} colorClass={levelInfo.color} />
        <LevelProgress info={levelInfo} ordersLabel={`${orders} completed order${orders !== 1 ? 's' : ''}`} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
          {[
            { l: 1, label: 'Starter Seller', at: 'On registration' },
            { l: 2, label: 'Trusted Seller', at: '10+ orders' },
            { l: 3, label: 'Elite Seller', at: '50+ orders' },
          ].map(({ l, label, at }) => (
            <div key={l} className={`rounded-xl p-2 border ${levelInfo.level >= l ? 'bg-[#FFF5F8] border-[#ECD4A8] text-[#a37b3d]' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
              <p className="font-bold">L{l}</p>
              <p className="font-medium text-[10px]">{label}</p>
              <p className="text-[9px] mt-0.5">{at}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Nav view lists ────────────────────────────────────────────────────────────

const BUYER_VIEWS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'marketplace', label: 'Marketplace', icon: <ShoppingBag size={20} /> },
  { id: 'visual', label: 'Find by Photo', icon: <Camera size={20} /> },
  { id: 'dowry', label: 'Budget Estimator', icon: <Calculator size={20} /> },
  { id: 'orders', label: 'My Orders', icon: <Package size={20} /> },
  { id: 'bnpl', label: 'My BNPL', icon: <ShoppingCart size={20} /> },
  { id: 'account', label: 'My Account', icon: <User size={20} /> },
];

const SELLER_VIEWS = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'upload', label: 'Upload Product', icon: <PlusCircle size={20} /> },
  { id: 'products', label: 'My Products', icon: <Package size={20} /> },
  { id: 'orders', label: 'Orders to Fulfill', icon: <ShoppingCart size={20} /> },
  { id: 'reviews', label: 'Reviews', icon: <Star size={20} /> },
  { id: 'finance', label: 'Financial Projection', icon: <LineChart size={20} /> },
  { id: 'account', label: 'My Account', icon: <User size={20} /> },
];

// Maps old view IDs (used by SellerDashboard's onNavigate) to new URL segments
const SELLER_NAV_MAP = {
  'upload': 'upload',
  'my-products': 'products',
  'fin-projection': 'finance',
  'seller-account': 'account',
  'seller-dashboard': 'dashboard',
};

// ── Route guards ──────────────────────────────────────────────────────────────


// Role-aware guards backed by the server-verified session (see src/auth/RequireRole.jsx).
// They never consult localStorage, sessionStorage or ?as= query parameters.
function RequireBuyer()  { return <RequireRole role="buyer" />; }
function RequireSeller() { return <RequireRole role="seller" />; }
function RequireAdmin()  { return <RequireRole role="admin" />; }

// ── Buyer Layout ──────────────────────────────────────────────────────────────

function BuyerLayout() {
  const { buyer, logoutBuyer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems, setBuyerId, items, addItem } = useCart();
  const [cartOpen, setCart] = useState(false);
  const { navBadges, markTypesRead } = useNotifications(buyer?.buyer_id, 'buyer');

  useEffect(() => {
    setBuyerId(buyer?.buyer_id || null);
  }, [buyer?.buyer_id, setBuyerId]);

  const seg = location.pathname.split('/')[2] || 'dashboard';

  // Clear sidebar badge when the buyer opens that section
  useEffect(() => {
    const types = NAV_BADGE_TYPES.buyer?.[seg];
    if (!types?.length) return;
    if ((navBadges[seg] || 0) <= 0) return;
    markTypesRead(types);
    // only when route section changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg]);

  // Hide the Notification bell on the dashboard only (other pages keep it).
  const isDashboard = seg === 'dashboard';

  // Big-Task-Batch2 §Thrift Search: show the common Search bar in the
  // Navbar ONLY when the user is on a marketplace page (marketplace, thrift,
  // or product detail).  Hidden everywhere else.
  const showGlobalSearch = ['marketplace', 'thrift', 'product', 'retail', 'visual'].includes(seg)
    || location.pathname.includes('/buyer/retail/product/')
    || location.pathname.includes('/buyer/thrift/product/');

  const handleLogout = async () => {
    await logoutBuyer();
    navigate('/buyer/login', { replace: true });
  };

  // Floating "Add to Cart" — for the dashboard, opens the cart drawer.
  // Per Big-Task-Batch2 §0: a floating Add to Cart button fixed bottom-right.
  const openCart = () => setCart(true);

  return (
    <div className="min-h-screen bg-[#FCFBFB] flex">
      {/* Sidebar */}
      <aside className="fixed md:static w-64 h-screen bg-white/60 backdrop-blur-xl border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-y-auto z-40">
        <div className="p-5 border-b border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <img src={logo} alt="ShaadiSahulat" className="w-10 h-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="font-heading font-bold text-gray-800 text-base leading-tight tracking-tight">ShaadiSahulat</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Buyer Portal</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1.5 mt-2">
          {BUYER_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => navigate(`/buyer/${v.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${seg === v.id
                  ? 'bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                  : 'text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800'
                }`}
            >
              <span className={`text-lg transition-transform duration-300 ${seg === v.id ? 'scale-110' : ''}`}>{v.icon}</span>
              <span>{v.label}</span>
              <NavBadge count={navBadges[v.id]} />
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100/50 bg-white/40 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shadow-sm bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8]">
              {buyer?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{buyer?.name}</p>
              <p className="text-xs text-gray-500 truncate">{buyer?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="md:hidden flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
              <h1 className="font-bold text-gray-800">ShaadiSahulat</h1>
            </div>
            {/* Big-Task-Batch2 §Thrift Search — common Search bar in the
                Navbar, shown ONLY on marketplace/thrift/product pages. */}
            {showGlobalSearch && (
              <div className="hidden md:block flex-1 max-w-md">
                <GlobalSearch onSelectProduct={(p) => {
                  const dest = p.marketplace_type === 'thrift'
                    ? `/buyer/thrift/product/${p.product_id}`
                    : `/buyer/retail/product/${p.product_id}`;
                  navigate(dest, { state: { product: p } });
                }} />
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:block text-xs text-gray-500">Hi, {buyer?.name?.split(' ')[0]}</span>
              {/* Big-Task-Batch2 §0: hide the NotificationBell on the Dashboard page only */}
              {!isDashboard && (
                <NotificationBell
                  userId={buyer?.buyer_id}
                  role="buyer"
                  onNavigate={(path) => navigate(path)}
                />
              )}
              <button
                onClick={() => setCart(true)}
                className="relative flex items-center gap-2 px-3 py-1.5 bg-[#a37b3d] text-white rounded-xl text-sm font-medium hover:bg-[#8a6633] transition-colors shadow-sm"
              >
                <ShoppingCart size={16} />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalItems > 9 ? '9+' : totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
        <div className="flex-1">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </div>
        <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
          ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
        </footer>
      </main>

      {/* Big-Task-Batch2 §0 — Floating "Add to Cart" button bottom-right.
          On the dashboard this opens the cart drawer.  On the marketplace
          it's hidden (the marketplace has its own per-card Add-to-Cart). */}
      {isDashboard && totalItems > 0 && (
        <button
          onClick={openCart}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-[#a37b3d] to-[#8a6633] text-white font-bold shadow-2xl hover:shadow-xl hover:scale-105 transition-all"
          title="View Cart"
        >
          <ShoppingCart size={20} />
          <span>Cart</span>
          <span className="ml-1 bg-white text-[#a37b3d] text-xs font-extrabold rounded-full w-5 h-5 flex items-center justify-center">
            {totalItems > 9 ? '9+' : totalItems}
          </span>
        </button>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCart(false)} buyerId={buyer?.buyer_id} />
    </div>
  );
}

// ── Seller Layout ─────────────────────────────────────────────────────────────

function SellerLayout() {
  const { seller, logoutSeller } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { navBadges, markTypesRead } = useNotifications(seller?.seller_id, 'seller');

  const seg = location.pathname.split('/')[2] || 'dashboard';

  useEffect(() => {
    const types = NAV_BADGE_TYPES.seller?.[seg];
    if (!types?.length) return;
    if ((navBadges[seg] || 0) <= 0) return;
    markTypesRead(types);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg]);

  const handleLogout = async () => {
    await logoutSeller();
    navigate('/seller/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#FCFBFB] flex">
      {/* Sidebar */}
      <aside className="fixed md:static w-64 h-screen bg-white/60 backdrop-blur-xl border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] overflow-y-auto z-40">
        <div className="p-5 border-b border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <img src={logo} alt="ShaadiSahulat" className="w-10 h-10 object-contain flex-shrink-0" />
            <div>
              <h1 className="font-heading font-bold text-gray-800 text-base leading-tight tracking-tight">ShaadiSahulat</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Seller Portal</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1.5 mt-2">
          {SELLER_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => navigate(`/seller/${v.id}`)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${seg === v.id
                  ? 'bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] text-[#a37b3d] shadow-sm border border-[#FBEFF1]'
                  : 'text-gray-500 hover:bg-white hover:shadow-sm hover:text-gray-800'
                }`}
            >
              <span className={`text-lg transition-transform duration-300 ${seg === v.id ? 'scale-110' : ''}`}>{v.icon}</span>
              <span>{v.label}</span>
              <NavBadge count={navBadges[v.id]} />
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100/50 bg-white/40 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg shadow-sm bg-gradient-to-br from-[#c09858] to-[#a37b3d]">
              {seller?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{seller?.name}</p>
              <p className="text-xs text-gray-500 truncate">{seller?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-100 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="md:hidden flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[#c09858] to-[#a37b3d] rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
              <h1 className="font-bold text-gray-800">ShaadiSahulat</h1>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="hidden sm:block text-xs text-gray-500">Hi, {seller?.name?.split(' ')[0]}</span>
              <NotificationBell
                userId={seller?.seller_id}
                role="seller"
                onNavigate={(path) => navigate(path)}
              />
            </div>
          </div>
        </header>
        <div className="flex-1">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </div>
        <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
          ShaadiSahulat — FYP 2026 | NUCES Chiniot-Faisalabad
        </footer>
      </main>
    </div>
  );
}

// ── Admin layout wrapper (passes auth props) ──────────────────────────────────

function AdminLayoutWrapper() {
  const { admin, logoutAdmin } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logoutAdmin();
    navigate('/admin/login', { replace: true });
  };
  return <AdminLayout admin={admin} onLogout={handleLogout} />;
}

function AdminSecurityPage() {
  return <ChangePasswordPanel />;
}

// ── Buyer page components ─────────────────────────────────────────────────────

function BuyerDashboardPage() {
  const { buyer } = useAuth();
  return (
    <FinalProjection
      buyer={buyer}
    />
  );
}

function BuyerMarketplacePage() {
  const { buyer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [highlightId, setHighlightId] = useState(location.state?.highlightProductId || null);

  return (
    <MarketplacePage
      highlightProductId={highlightId}
      onHighlightCleared={() => setHighlightId(null)}
      buyer={buyer}
      initialCategory={location.state?.major_category || ''}
      initialSubcategory={location.state?.subcategory || ''}
      onViewProduct={(p) => navigate(`/buyer/retail/product/${p.product_id}`, { state: { product: p, from: 'marketplace' } })}
    />
  );
}

function BuyerThriftPage() {
  const { buyer } = useAuth();
  const navigate = useNavigate();
  return (
    <ThriftHomePage
      buyer={buyer}
      onProductClick={(p) => navigate(`/buyer/thrift/product/${p.product_id}`, { state: { product: p, from: 'thrift' } })}
    />
  );
}

function BuyerVisualPage() {
  const { buyer } = useAuth();
  const navigate = useNavigate();
  return (
    <VisualRecPage
      userId={buyer?.buyer_id}
      onNavigateToProduct={(productId) =>
        navigate('/buyer/marketplace', { state: { highlightProductId: productId } })
      }
    />
  );
}

function BuyerDowryPage() {
  const { buyer } = useAuth();
  return <DowryPage userId={buyer?.buyer_id} />;
}

function BuyerProjectionPage() {
  const { buyer } = useAuth();
  return <FinalProjection buyer={buyer} />;
}

function BuyerAccountPage() {
  const { buyer } = useAuth();
  return (
    <>
      <EmailVerificationBanner className="max-w-2xl mx-auto mb-6" />
      <BuyerAccountView buyer={buyer} />
      <ChangePasswordPanel className="max-w-2xl mx-auto mt-6" />
    </>
  );
}

function BuyerProductDetailPage() {
  const { buyer } = useAuth();
  const navigate = useNavigate();
  const { productId } = useParams();
  const location = useLocation();
  const product = location.state?.product || null;
  // Determine storefront from URL: /buyer/retail/product/:id  OR  /buyer/thrift/product/:id
  // Fall back to "marketplace" for legacy /buyer/product/:id and /buyer/thrift/:id links.
  const pathSegments = location.pathname.split('/');
  const from = pathSegments.includes('thrift') ? 'thrift' : 'marketplace';

  const goListing = (crumb) => {
    if (from === 'thrift') {
      navigate('/buyer/thrift');
      return;
    }
    const level = crumb?.level || 'root';
    navigate('/buyer/marketplace', {
      state: {
        major_category: level === 'root' ? '' : (crumb.major_category || ''),
        subcategory: level === 'subcategory' ? (crumb.subcategory || '') : '',
      },
    });
  };

  return (
    <ProductDetailPage
      product={product}
      productId={productId}
      buyer={buyer}
      onBack={() => navigate(`/buyer/${from}`)}
      onBreadcrumbNavigate={goListing}
    />
  );
}

// ── Seller page components ────────────────────────────────────────────────────

function SellerDashboardPage() {
  const { seller } = useAuth();
  const navigate = useNavigate();
  return (
    <SellerDashboard
      seller={seller}
      onNavigate={(id) => navigate(`/seller/${SELLER_NAV_MAP[id] || id}`)}
    />
  );
}

function SellerUploadPage() {
  return <SellerPage />;
}

function SellerProductsPage() {
  const { seller } = useAuth();
  return <ProductList sellerId={seller?.seller_id} seller={seller} />;
}

function SellerFinancePage() {
  const { seller } = useAuth();
  return <SellerFinancialProj seller={seller} />;
}

function SellerAccountPage() {
  const { seller } = useAuth();
  return (
    <>
      <EmailVerificationBanner className="max-w-lg mx-auto mb-4" />
      <SellerAccountView seller={seller} />
      <ChangePasswordPanel className="max-w-lg mx-auto mt-4" />
    </>
  );
}

// ── Wrapper pages for new modules (inject auth from context) ──────────────────

function BuyerOrdersPageWrapper() {
  const { buyer } = useAuth();
  return <BuyerOrdersPage buyer={buyer} />;
}
function BuyerOrderDetailPageWrapper() {
  const { buyer } = useAuth();
  return <BuyerOrderDetailPage buyer={buyer} />;
}
function BNPLStatusPageWrapper() {
  const { buyer } = useAuth();
  return <BNPLStatusPage buyer={buyer} />;
}
function BNPLApplyPageWrapper() {
  const { buyer } = useAuth();
  return <BNPLApplyPage buyer={buyer} />;
}
function CheckoutPageWrapper() {
  const { buyer } = useAuth();
  const { items, clearCart } = useCart();
  const navigate = useNavigate();
  return (
    <CheckoutPage
      buyer={buyer}
      items={items}
      onClose={() => navigate('/buyer/marketplace')}
      onSuccess={() => { clearCart(); }}
    />
  );
}
function SellerOrdersPageWrapper() {
  const { seller } = useAuth();
  return <SellerOrdersPage seller={seller} />;
}
// Seller Order Detail page — reads :orderId + ?t=<token> from URL internally.
function SellerOrderDetailPageWrapper() {
  return <SellerOrderDetailPage />;
}
function AdminOrdersPageWrapper() {
  const { admin } = useAuth();
  return <OrdersPage admin={admin} />;
}
function AdminDisputesPageWrapper() {
  const { admin } = useAuth();
  return <AdminDisputesPage admin={admin} />;
}
function AdminWalletPageWrapper() {
  const { admin } = useAuth();
  return <AdminWalletPage admin={admin} />;
}

function AdminBnplRepaymentsPageWrapper() {
  const { admin } = useAuth();
  return <AdminBnplRepaymentsPage admin={admin} />;
}
function FinancialDashboardWrapper() {
  const { admin } = useAuth();
  return <FinancialDashboard admin={admin} />;
}
function SellerReviewsPageWrapper() {
  const { seller } = useAuth();
  return <SellerReviewsPage seller={seller} />;
}
function AdminReviewsPageWrapper() {
  const { admin } = useAuth();
  return <AdminReviewsPage admin={admin} />;
}
function DisputeChatWrapper() {
  // One verified session per browser. The role comes ONLY from the server-verified
  // session — `?as=` / location.state.asRole links are informational and never grant a role.
  const { status, user } = useAuth();
  if (status === "loading") return <AuthLoading />;
  if (status !== "authenticated" || !user) return <Navigate to="/" replace />;
  const fallbackName = { buyer: "Buyer", seller: "Seller", admin: "Admin" }[user.role];
  return <DisputeChatPage user={{ id: user.id, role: user.role, name: user.name || fallbackName }} />;
}

// ── Login pages ───────────────────────────────────────────────────────────────

const ROLE_LABEL = { buyer: 'Buyer', seller: 'Seller', admin: 'Admin' };

/** Shown on a login page when this browser is already signed in with a different role. */
function SignedInAsOtherRole({ currentRole, targetRole }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen bg-[#FCFBFB] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#FBEFF1] p-6 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          You're signed in as a {ROLE_LABEL[currentRole]}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Only one account can be signed in per browser. Sign out to continue as a {ROLE_LABEL[targetRole]},
          or use a separate browser profile.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(ROLE_HOME[currentRole], { replace: true })}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Go to my dashboard
          </button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await logout(); setBusy(false); }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#a37b3d] to-[#c69a54] text-white text-sm font-bold disabled:opacity-60">
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shared login-route wrapper: waits for session restore, then routes by verified role. */
function RoleLoginRoute({ role, children }) {
  const { status, role: currentRole } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <AuthLoading />;
  if (status === 'authenticated') {
    if (currentRole === role) return <Navigate to={postLoginPath(role, location.state?.from)} replace />;
    return <SignedInAsOtherRole currentRole={currentRole} targetRole={role} />;
  }
  return children;
}

function BuyerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <RoleLoginRoute role="buyer">
      <BuyerAuthPage onLogin={(u) => navigate(postLoginPath(u.role, location.state?.from), { replace: true })} />
    </RoleLoginRoute>
  );
}

function SellerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <RoleLoginRoute role="seller">
      <SellerAuthPage onLogin={(u) => navigate(postLoginPath(u.role, location.state?.from), { replace: true })} />
    </RoleLoginRoute>
  );
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <RoleLoginRoute role="admin">
      <AdminLogin
        onLogin={(u) => navigate(postLoginPath(u.role, location.state?.from), { replace: true })}
        onBack={() => navigate('/')}
      />
    </RoleLoginRoute>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────

function Landing() {
  const { buyer, seller } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FCFBFB] relative">
      <LandingPage
        onSelectBuyer={() => navigate(buyer ? '/buyer/dashboard' : '/buyer/login')}
        onSelectSeller={() => navigate(seller ? '/seller/dashboard' : '/seller/login')}
      />
      <button
        onClick={() => navigate('/admin/login')}
        className="fixed bottom-4 right-4 text-xs text-gray-400 hover:text-gray-600 bg-white/80 border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
      >
        Admin Portal
      </button>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <CartProvider>
      <AuthProvider>
        <SocketProvider>
          <Routes>
            {/* Landing */}
            <Route path="/" element={<Landing />} />

            {/* Password reset + email verification (public; one-time token in ?token=) */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password"  element={<ResetPasswordPage />} />
            <Route path="/verify-email"    element={<VerifyEmailPage />} />

            {/* Buyer */}
            <Route path="/buyer/login" element={<BuyerLoginPage />} />
            <Route path="/buyer" element={<RequireBuyer />}>
              <Route element={<BuyerLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<BuyerDashboardPage />} />
                <Route path="marketplace" element={<BuyerMarketplacePage />} />
                <Route path="thrift" element={<BuyerThriftPage />} />
                {/* ── Storefront-aware PDP URLs (Big-Task-Batch2 §1.1.3) ── */}
                {/* /buyer/retail/product/:id  vs  /buyer/thrift/product/:id  */}
                <Route path="retail/product/:productId" element={<BuyerProductDetailPage />} />
                <Route path="thrift/product/:productId" element={<BuyerProductDetailPage />} />
                {/* Legacy fallback routes — still work for older links */}
                <Route path="thrift/:productId" element={<BuyerProductDetailPage />} />
                <Route path="visual" element={<BuyerVisualPage />} />
                <Route path="dowry" element={<BuyerDowryPage />} />
                <Route path="projection" element={<Navigate to="/buyer/dashboard" replace />} />
                <Route path="account" element={<BuyerAccountPage />} />
                <Route path="product/:productId" element={<BuyerProductDetailPage />} />
                <Route path="orders" element={<BuyerOrdersPageWrapper />} />
                <Route path="orders/:orderId" element={<BuyerOrderDetailPageWrapper />} />
                <Route path="bnpl" element={<BNPLStatusPageWrapper />} />
                <Route path="checkout" element={<CheckoutPageWrapper />} />
              </Route>
            </Route>

            {/* BNPL apply flow — same buyer auth, no sidebar layout */}
            <Route path="/bnpl/apply/:orderId" element={<RequireBuyer />}>
              <Route index element={<BNPLApplyPageWrapper />} />
            </Route>

            {/* Dispute chat — accessible to buyer/seller/admin */}
            <Route path="/disputes/:disputeId" element={<DisputeChatWrapper />} />

            {/* Bank officer portal — fully standalone */}
            <Route path="/bank/login" element={<BankLoginPage />} />
            <Route path="/bank/dashboard" element={<BankDashboardPage />} />

            {/* Seller */}
            <Route path="/seller/login" element={<SellerLoginPage />} />
            <Route path="/seller" element={<RequireSeller />}>
              <Route element={<SellerLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<SellerDashboardPage />} />
                <Route path="upload" element={<SellerUploadPage />} />
                <Route path="products" element={<SellerProductsPage />} />
                <Route path="finance" element={<SellerFinancePage />} />
                <Route path="orders" element={<SellerOrdersPageWrapper />} />
                <Route path="orders/:orderId" element={<SellerOrderDetailPageWrapper />} />
                <Route path="reviews" element={<SellerReviewsPageWrapper />} />
                <Route path="account" element={<SellerAccountPage />} />
                <Route path="offers" element={<Navigate to="dashboard" replace />} />
              </Route>
            </Route>

            {/* Admin */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<RequireAdmin />}>
              <Route element={<AdminLayoutWrapper />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<FinancialDashboardWrapper />} />
                <Route path="sellers" element={<SellerManagement />} />
                <Route path="buyers" element={<BuyerManagement />} />
                <Route path="marketplace" element={<MarketplacePage isAdminView={true} />} />
<Route path="categories" element={<CategoryManager />} />
<Route path="banners" element={<Navigate to="dashboard" replace />} />
<Route path="orders" element={<AdminOrdersPageWrapper />} />
<Route path="disputes" element={<AdminDisputesPageWrapper />} />
<Route path="reviews" element={<AdminReviewsPageWrapper />} />
<Route path="wallet" element={<AdminWalletPageWrapper />} />
<Route path="security" element={<AdminSecurityPage />} />
<Route path="bnpl-repayments" element={<AdminBnplRepaymentsPageWrapper />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </CartProvider>
  );
}

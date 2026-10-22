// Pages and URLs. The simulator brings its own router (hash by default) unless it is rendered
// inside an app that already uses React Router; then its routes nest under wherever the app
// mounts it (e.g. <Route path="sim/*" element={<ChatbotSimulator … />} />).
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  BrowserRouter,
  HashRouter,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useInRouterContext,
  useNavigate,
  useResolvedPath,
} from 'react-router';
import { useSimStatic } from './context';
import { Header } from './Header';
import { Board } from './Board';
import { Timeline } from './Timeline';
import { SettingsPage, SettingsSection } from './settings/SettingsPage';

export interface Paths {
  home: string;
  timeline: string;
  settings: string;
}
const PathsContext = createContext<Paths>({ home: '/', timeline: '/timeline', settings: '/settings' });
/** Absolute paths of the simulator's pages (they depend on where it is mounted). */
export const usePaths = () => useContext(PathsContext);

/** The host's router when there is one, else our own. */
export function SimRouter({ routing, children }: { routing: 'hash' | 'browser' | 'memory'; children: ReactNode }) {
  if (useInRouterContext()) return <>{children}</>;
  if (routing === 'memory') return <MemoryRouter>{children}</MemoryRouter>;
  if (routing === 'browser') return <BrowserRouter>{children}</BrowserRouter>;
  return <HashRouter>{children}</HashRouter>;
}

export function SimRoutes() {
  const store = useSimStatic();
  const profileEditable = !store.opts.lockProfile;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Board />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="settings" element={<SettingsPage />}>
          <Route index element={<Navigate to={profileEditable ? 'general' : 'adapters'} replace />} />
          <Route path=":section" element={<SettingsSection />} />
        </Route>
        <Route path="*" element={<GoHome />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  const store = useSimStatic();
  const navigate = useNavigate();
  const base = useResolvedPath('.').pathname.replace(/\/$/, '');
  const paths = useMemo<Paths>(() => ({ home: base || '/', timeline: base + '/timeline', settings: base + '/settings' }), [base]);
  useEffect(() => store.setShowBoard(() => navigate(paths.home)), [store, navigate, paths.home]);
  return (
    <PathsContext.Provider value={paths}>
      <Header />
      <main className="cbs-main">
        <Outlet />
      </main>
    </PathsContext.Provider>
  );
}

function GoHome() {
  return <Navigate to={usePaths().home} replace />;
}

import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import 'tetherkit-core/styles.css';
import './styles.css';

// One build, two roles: `/control` is the phone controller, everything else is the desktop host.
// Lazy imports keep Three.js out of the phone bundle.
const isController = /\/control\/?$/.test(location.pathname);
document.body.classList.add(isController ? 'is-controller' : 'is-host');

const App = lazy(() => (isController ? import('./controller/ControllerApp') : import('./host/HostApp')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Loading tether-deck…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);

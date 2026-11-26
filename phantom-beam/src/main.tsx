import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import 'tetherkit-core/styles.css';
import './styles.css';

// `/control` = phone EMF reader; anything else = desktop corridor. Three.js stays out of the phone bundle.
const isController = /\/control\/?$/.test(location.pathname);
document.body.classList.add(isController ? 'is-controller' : 'is-host');

const App = lazy(() => (isController ? import('./controller/ControllerApp') : import('./host/HostApp')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Summoning phantom-beam…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);

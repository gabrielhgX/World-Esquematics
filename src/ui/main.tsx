import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OBJECT_TYPE_PRESETS } from '../tools/ObjectTool';
import { createWebPlatform } from '../platform/web/WebPlatform';
import App from './App';
import './styles.css';

// Raiz de composição (README §10.2): AQUI se decide qual Platform o app usa.
// O build da Steam monta um platform/electron no lugar — o App não muda.
const platform = createWebPlatform({
  assets: OBJECT_TYPE_PRESETS.map((type) => ({ type, label: type })),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);

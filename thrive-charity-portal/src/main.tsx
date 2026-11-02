import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import './styles/brand.css';
import App from './App';

// Mirrors src/styles/brand.css, which is copied from the vendor portal so the
// two products share one palette rather than two drifting approximations.
const theme = {
  token: {
    colorPrimary: '#DB8633',
    colorLink: '#DB8633',
    colorTextHeading: '#324E58',
    borderRadius: 10,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);

import React from 'react';
import { Layout, Typography, Button, Space } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Header, Content } = Layout;
const { Text } = Typography;

// Brand values come from src/styles/brand.css, which is the same file the
// vendor portal uses, so the two products stay in step. #324E58 is what the
// palette calls teal; an earlier draft here used #21555b, which is not in it.
const BRAND_TEAL = '#324E58';
const BRAND_BG = '#F5F5FA';

/** Header plus a centred column. Deliberately plain: a charity signs in to do
 *  one job, and chrome would only get between them and it. */
const PortalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <Layout style={{ minHeight: '100vh', background: BRAND_BG }}>
      <Header
        style={{
          background: BRAND_TEAL,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <Space size={14} align="center">
          <img
            src="/thrive-white-logo.png"
            alt="THRIVE Initiative"
            // 380x60 native. The wordmark carries "Change4Good.org" beneath it,
            // so it needs enough height to stay legible rather than turning to
            // mush, and a rule to keep it from colliding with the label below.
            style={{ height: 32, width: 'auto', display: 'block' }}
          />
          <span
            aria-hidden
            style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.28)', display: 'block' }}
          />
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>for charities</Text>
        </Space>
        {user && (
          <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: 'rgba(255,255,255,0.85)' }}>
            Sign out
          </Button>
        )}
      </Header>
      <Content style={{ padding: '28px 16px 64px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>{children}</div>
      </Content>
    </Layout>
  );
};

export default PortalShell;

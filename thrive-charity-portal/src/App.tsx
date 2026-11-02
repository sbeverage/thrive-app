import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PortalShell from './components/PortalShell';
import Login from './pages/Login';
import Register from './pages/Register';
import FindCharity from './pages/FindCharity';
import ClaimRequest from './pages/ClaimRequest';
import RegisterCharity from './pages/RegisterCharity';
import Pending from './pages/Pending';
import Profile from './pages/Profile';

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <PortalShell>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Onboarding. The lookup comes first for both paths: a charity that
              is already on THRIVE is a claim, one that is not is a signup, and
              nobody should have to know which they are before they start. */}
          <Route path="/start" element={<ProtectedRoute><FindCharity /></ProtectedRoute>} />
          <Route path="/start/new" element={<ProtectedRoute><RegisterCharity /></ProtectedRoute>} />
          <Route path="/start/claim/:charityId" element={<ProtectedRoute><ClaimRequest /></ProtectedRoute>} />
          <Route path="/pending" element={<ProtectedRoute><Pending /></ProtectedRoute>} />

          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          <Route path="/" element={<Navigate to="/profile" replace />} />
          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Routes>
      </PortalShell>
    </AuthProvider>
  </BrowserRouter>
);

export default App;

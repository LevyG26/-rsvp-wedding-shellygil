/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Photos } from './pages/Photos';
import { AdminLogin } from './pages/AdminLogin.tsx';
import { AdminDashboard } from './pages/AdminDashboard.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/he" replace />} />
        <Route path="/link/:phoneNumber" element={<Home />} />
        <Route path="/:lang" element={<Home />} />
        <Route path="/:lang/photos" element={<Photos />} />
        <Route path="/:lang/admin" element={<AdminLogin />} />
        <Route path="/:lang/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/:lang/link/:phoneNumber" element={<Home />} />
        <Route path="/:lang/:phoneNumber" element={<Home />} />
        <Route path="*" element={<Navigate to="/he" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

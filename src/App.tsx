/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';

import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';
import { FlatsPage } from './pages/FlatsPage';
import { FlatFormPage } from './pages/FlatFormPage';
import { FlatDetailPage } from './pages/FlatDetailPage';
import { FlatmatesPage } from './pages/FlatmatesPage';
import { BooksPage } from './pages/BooksPage';
import { BookFormPage } from './pages/BookFormPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { ActivityPage } from './pages/ActivityPage';
import { MessagesPage } from './pages/MessagesPage';
import { AdminModerationPage } from './pages/AdminModerationPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppShell>
            <Routes>
              {/* Public Discovery & Authentication Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/flats" element={<FlatsPage />} />
              <Route path="/flats/:id" element={<FlatDetailPage />} />
              <Route path="/flatmates" element={<FlatmatesPage />} />
              <Route path="/books" element={<BooksPage />} />
              <Route path="/books/:id" element={<BookDetailPage />} />

              {/* Authenticated Student Protected Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/flats/new"
                element={
                  <ProtectedRoute>
                    <FlatFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/flats/:id/edit"
                element={
                  <ProtectedRoute>
                    <FlatFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/books/new"
                element={
                  <ProtectedRoute>
                    <BookFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/books/:id/edit"
                element={
                  <ProtectedRoute>
                    <BookFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/activity"
                element={
                  <ProtectedRoute>
                    <ActivityPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages/:conversationId"
                element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                }
              />

              {/* Role-Protected Administrator Moderation Console */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminModerationPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

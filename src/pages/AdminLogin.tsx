import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { Language, translations } from '../i18n';
import { loginAsAdmin, onAdminAuthStateChanged } from '../admin/auth';
import { useAdminTheme } from '../hooks/useAdminTheme';

export function AdminLogin() {
    const { lang } = useParams<{ lang: string }>();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const { theme, toggleTheme } = useAdminTheme();

    if (!lang || !['en', 'he', 'fr'].includes(lang)) {
        return <Navigate to="/he/admin" replace />;
    }

    const currentLang = lang as Language;
    const isRtl = currentLang === 'he';
    const t = translations[currentLang];
    const dashboardPath = `/${currentLang}/admin/dashboard`;

    useEffect(() => {
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
        document.documentElement.lang = currentLang;
    }, [currentLang, isRtl]);

    // Firebase Auth state is asynchronous, so we wait for the first callback
    // before deciding whether to redirect straight to the dashboard.
    useEffect(() => {
        const unsubscribe = onAdminAuthStateChanged((user) => {
            setIsSignedIn(user !== null);
            setIsCheckingSession(false);
        });
        return unsubscribe;
    }, []);

    if (isCheckingSession) {
        return null;
    }

    if (isSignedIn) {
        return <Navigate to={dashboardPath} replace />;
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!email.trim() || !password) {
            setError(t.adminRequiredFields);
            return;
        }

        setError('');
        setIsSubmitting(true);

        try {
            await loginAsAdmin(email, password);
            navigate(dashboardPath, { replace: true });
        } catch (loginError) {
            console.error('Admin sign-in failed', loginError);
            setIsSubmitting(false);
            setError(t.adminInvalidCredentials);
        }
    };

    // See the matching comment in AdminDashboard.tsx: a `dark:` utility on
    // the same element as the `.dark` class itself never applies (that
    // selector only matches descendants of `.dark`), so the background is
    // chosen directly in JS instead.
    return (
        <div className={`min-h-screen relative overflow-hidden selection:bg-rose-200 selection:text-rose-900 ${theme === 'dark' ? 'dark bg-slate-950' : 'wedding-silk-background'}`}>
            <div className="absolute inset-0 z-0 wedding-foliage-shadow dark:hidden" aria-hidden="true" />
            <div className="absolute inset-0 z-0 wedding-paper-grain dark:hidden" aria-hidden="true" />

            <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? t.adminThemeToLight : t.adminThemeToDark}
                aria-label={theme === 'dark' ? t.adminThemeToLight : t.adminThemeToDark}
                className={`absolute top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-gray-700 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${isRtl ? 'left-4' : 'right-4'}`}
            >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative z-10 min-h-screen px-4 py-14 sm:px-6 lg:px-8 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md rounded-3xl border border-white/30 bg-white/90 p-8 sm:p-10 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95"
                >
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-lg shadow-gray-900/25 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none">
                            <LockKeyhole size={24} />
                        </div>
                        <h1 className="text-3xl font-serif text-gray-900 dark:text-slate-100">{t.adminLoginTitle}</h1>
                        <p className="mt-2 text-gray-600 dark:text-slate-400">{t.adminLoginSubtitle}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{t.adminUsername}</label>
                            <div className="relative">
                                <Mail size={18} className={`absolute top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 ${isRtl ? 'left-4' : 'right-4'}`} />
                                <input
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    type="email"
                                    autoComplete="username"
                                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 outline-none transition-all focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-rose-400 dark:focus:ring-rose-900/40"
                                    placeholder={t.adminUsername}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{t.adminPassword}</label>
                            <div className="relative">
                                <input
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-gray-900 outline-none transition-all focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-rose-400 dark:focus:ring-rose-900/40"
                                    placeholder={t.adminPassword}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((previousValue) => !previousValue)}
                                    aria-label={showPassword ? t.adminHidePassword : t.adminShowPassword}
                                    title={showPassword ? t.adminHidePassword : t.adminShowPassword}
                                    className={`absolute top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 ${isRtl ? 'left-3' : 'right-3'}`}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error ? <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p> : null}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full rounded-2xl py-4 text-lg font-medium text-white shadow-lg transition-colors ${isSubmitting ? 'cursor-not-allowed bg-gray-600 dark:bg-slate-600' : 'bg-gray-900 hover:bg-gray-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                                }`}
                        >
                            {isSubmitting ? t.adminSigningIn : t.adminLoginButton}
                        </button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}

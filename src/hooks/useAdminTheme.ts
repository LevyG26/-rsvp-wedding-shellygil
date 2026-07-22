import { useEffect, useState } from 'react';

export type AdminTheme = 'light' | 'dark';

const STORAGE_KEY = 'admin-theme';

function readStoredTheme(): AdminTheme {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

// Manual light/dark toggle scoped to the admin area only - the returned
// `theme` is meant to be turned into a `dark` class on each admin page's own
// root element (see index.css's `@custom-variant dark`), never on
// `document.documentElement`, so it can never leak into the public
// guest-facing site. Persisted to localStorage so the choice survives
// reloads and carries over from the login screen to the dashboard.
export function useAdminTheme() {
    const [theme, setTheme] = useState<AdminTheme>(readStoredTheme);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggleTheme = () => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));

    return { theme, toggleTheme };
}

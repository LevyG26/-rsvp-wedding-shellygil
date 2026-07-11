import { useParams, Navigate, Link } from 'react-router-dom';
import { Language, translations } from '../i18n';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Camera } from 'lucide-react';
import { useEffect } from 'react';

export function Photos() {
  const { lang } = useParams<{ lang: string }>();

  if (!lang || !['en', 'he', 'fr'].includes(lang)) {
    return <Navigate to="/he/photos" replace />;
  }

  const currentLang = lang as Language;
  const isRtl = currentLang === 'he';
  const t = translations[currentLang];

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [currentLang, isRtl]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-stone-50 selection:bg-rose-200 selection:text-rose-900">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-multiply"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=2069&auto=format&fit=crop")'
        }}
      />

      <div className="absolute inset-0 z-0 bg-gradient-to-b from-stone-50/90 via-stone-50/80 to-stone-100/95" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full bg-white/80 backdrop-blur-md p-10 rounded-3xl shadow-xl text-center border border-white/50"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gray-100 rounded-full text-gray-700">
              <Camera size={48} strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-serif text-gray-900 mb-6 drop-shadow-sm">
            {t.photos}
          </h1>

          <p className="text-xl text-gray-600 font-light mb-10 leading-relaxed">
            {t.photosMessage}
          </p>

          <Link
            to={`/${currentLang}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors shadow-md"
          >
            {isRtl ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
            <span>{t.back}</span>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

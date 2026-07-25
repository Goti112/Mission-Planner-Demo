import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import './LanguageSelector.css';

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cierra si se clica fuera del dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setIsOpen(false);
  };

  const isEs = i18n.resolvedLanguage === 'es';

  return (
    <div className="lang-selector-container" ref={dropdownRef}>
      <button 
        className={`lang-selector-btn ${isOpen ? 'lang-selector-btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Cambiar idioma / Change language"
      >
        <Globe size={13} />
        <span>{isEs ? 'Español' : 'English'}</span>
      </button>

      {isOpen && (
        <div className="lang-dropdown">
          <button 
            className={`lang-dropdown-item ${isEs ? 'active' : ''}`}
            onClick={() => changeLanguage('es')}
          >
            <span>🇪🇸</span> Español
          </button>
          <button 
            className={`lang-dropdown-item ${!isEs ? 'active' : ''}`}
            onClick={() => changeLanguage('en')}
          >
            <span>🇬🇧</span> English
          </button>
        </div>
      )}
    </div>
  );
};

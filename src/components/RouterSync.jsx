import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const RouterSync = ({ view, setView, setInfoPage, setFilterCategory }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Sync URL -> State
  useEffect(() => {
    const path = location.pathname;
    
    if (path === '/') {
      if (view !== 'store' || document.getElementById('hero')) {
        setView('store');
        window.scrollTo(0, 0);
      }
    } else if (path === '/shop') {
      setView('store');
      setFilterCategory(null);
      setTimeout(() => {
        document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (path === '/cart') {
      setView('checkout');
    } else if (path === '/about') {
      setInfoPage({ title: 'About Us', content: "Founded with a passion for excellence, Zord Pakistan is dedicated to redefining the standards of premium footwear globally." });
    } else if (path === '/contact') {
      setInfoPage({ title: 'Contact', content: "Have a question? We're here to help. You can reach us at zordofficialpk@gmail.com or visit our HQ in Jhang, Pakistan. Our support team is available 24/7." });
    } else if (path.startsWith('/product/')) {
      // Assuming product modal is open if we set selectedProduct
      // But we can't easily fetch product by ID here without passing products array.
      // So let's rely on State -> URL mostly.
    }
  }, [location.pathname, setFilterCategory, setInfoPage, setView, view]);

  // Sync State -> URL
  useEffect(() => {
    if (view === 'checkout') {
      if (location.pathname !== '/cart') navigate('/cart');
    } else if (view === 'store') {
      // Don't force to '/' if they are at /shop or /product
      if (location.pathname !== '/' && location.pathname !== '/shop' && !location.pathname.startsWith('/product/')) {
        navigate('/');
      }
    }
  }, [location.pathname, navigate, view]);

  return null;
};

export default RouterSync;

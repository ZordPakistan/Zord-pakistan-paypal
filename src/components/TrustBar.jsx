import React, { useState, useEffect } from 'react';
import './TrustBar.css';

const TrustBar = () => {
  const [isVisible, setIsVisible] = useState(() => !localStorage.getItem('trust_bar_dismissed'));
  const [currentIndex, setCurrentIndex] = useState(0);

  const trustItems = [
    { icon: '✨', text: '100% PREMIUM QUALITY GUARANTEED' },
    { icon: '🚚', text: 'FREE EXPRESS SHIPPING NATIONWIDE' },
    { icon: '🔄', text: 'EASY 7-DAY RETURN POLICY' },
    { icon: '💵', text: 'CASH ON DELIVERY AVAILABLE' }
  ];

  useEffect(() => {
    if (isVisible) {
      const interval = setInterval(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % trustItems.length);
      }, 4000); // Cycle every 4 seconds
      return () => clearInterval(interval);
    }
  }, [isVisible, trustItems.length]);

  const handleDismiss = () => {
    localStorage.setItem('trust_bar_dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="trust-bar-container animate-trust-bar">
      <div className="trust-bar-carousel">
        {trustItems.map((item, index) => (
          <div 
            key={index} 
            className={`trust-item-slide ${currentIndex === index ? 'active' : ''}`}
          >
            <span className="trust-icon">{item.icon}</span>
            <span>{item.text}</span>
          </div>

        ))}
      </div>
      <button 
        onClick={handleDismiss} 
        className="trust-bar-dismiss"
        aria-label="Dismiss"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default TrustBar;



import React from 'react';

const WhatsAppButton = () => {
  const handleClick = () => {
    import('../utils/analytics.js').then(({ trackEvent }) => {
      trackEvent('whatsapp_click', { button_location: 'floating' });
    });
  };

  return (
    <a 
      href="https://wa.me/923061412735" 
      target="_blank" 
      rel="noopener noreferrer"
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '16px',
        zIndex: 9999,
        backgroundColor: '#25D366',
        color: 'white',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
        animation: 'pulse-animation 2s infinite'
      }}
    >
      <i className="fab fa-whatsapp" style={{ fontSize: '35px' }}></i>
      <style>
        {`
          @keyframes pulse-animation {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
            70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
          }
        `}
      </style>
    </a>
  );
};

export default WhatsAppButton;

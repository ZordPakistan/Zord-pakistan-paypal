import React, { useState, useEffect, useRef } from 'react';
import emailjs from '@emailjs/browser';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import WhatsAppButton from './components/WhatsAppButton';
import TrustBar from './components/TrustBar';
import SEO from './components/SEO';
import SizeGuide from './components/SizeGuide';
import ProductFilters from './components/ProductFilters';
import CustomerReviews from './components/CustomerReviews';
import './App.css';
import { INITIAL_PRODUCTS, INITIAL_SLIDES, CATEGORIES, INITIAL_REVIEWS } from './data';
import { db, storage } from './firebase';
import { ref as dbRef, onValue, set, remove } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { trackEvent } from './utils/analytics';
import { createPayPalOrder, capturePayPalOrder } from './services/paymentService';


const calculateDiscount = (price, originalPrice) => {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
};

const CountdownTimer = ({ endDate }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const target = new Date(endDate).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  if (!timeLeft) return null;

  return (
    <div className="countdown-timer animate-fade-in">
      <div className="countdown-item"><span className="countdown-val">{timeLeft.days}</span><span className="countdown-label">d</span></div>
      <div className="countdown-item"><span className="countdown-val">{timeLeft.hours}</span><span className="countdown-label">h</span></div>
      <div className="countdown-item"><span className="countdown-val">{timeLeft.minutes}</span><span className="countdown-label">m</span></div>
      <div className="countdown-item"><span className="countdown-val">{timeLeft.seconds}</span><span className="countdown-label">s</span></div>
    </div>
  );
};

function App() {
  const [products, setProducts] = useState([]);
  const [slides, setSlides] = useState([]);
  const [collections, setCollections] = useState([]);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [siteContent, setSiteContent] = useState({ about: '', shipping: '' });
  const [footerContent, setFooterContent] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileCollectionsOpen, setIsMobileCollectionsOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(() => !localStorage.getItem('zord_welcome_seen'));
  const [showSplash, setShowSplash] = useState(true); // Always show on every page load/refresh
  const [lastOrderId, setLastOrderId] = useState('');
  const [reviews, setReviews] = useState([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [newReview, setNewReview] = useState({ name: '', location: '', rating: 5, comment: '' });
  const [visibleProducts, setVisibleProducts] = useState(8);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({ search: '', category: '', size: '', minPrice: 0, maxPrice: 50000, color: '' });

  // Track Order State
  const [trackQuery, setTrackQuery] = useState('');
  const [trackedOrder, setTrackedOrder] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const STATUS_STEPS = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(['Aether', 'Kinetic', 'Velocity']);

  // Image Upload State
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [extraImageFiles, setExtraImageFiles] = useState([]);
  const [extraImageUrlInput, setExtraImageUrlInput] = useState('');
  const [hoverImageFile, setHoverImageFile] = useState(null);
  const [hoverImageUrlInput, setHoverImageUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        handleEnterSite();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  const handleEnterSite = () => {
    const splashEl = document.getElementById('splash-screen');
    if (splashEl) {
      splashEl.classList.add('fade-out');
      setTimeout(() => {
        setShowSplash(false);
      }, 800); // Match the CSS fade-out transition duration
    } else {
      setShowSplash(false);
    }
  };

  // Firebase Synchronization
  useEffect(() => {
    const productsRef = dbRef(db, 'products');
    const slidesRef = dbRef(db, 'slides');
    const collectionsRef = dbRef(db, 'collections');
    const assetsRef = dbRef(db, 'assets');
    const categoriesRef = dbRef(db, 'categories');
    const contentRef = dbRef(db, 'siteContent');
    const footerRef = dbRef(db, 'footerContent');
    const ordersRef = dbRef(db, 'orders');
    const reviewsRef = dbRef(db, 'reviews');

    const DEFAULT_FOOTER = {
      "Sneaker Fest": "The ultimate celebration of footwear. Sneaker Fest is our annual event where we showcase limited edition prototypes and rare collaborations.",
      "Men": "Premium footwear for men. Designed for performance and engineered for style.",
      "Women": "Fashion-forward footwear for women. From professional elegance to athletic power.",
      "Kids": "Durable and stylish shoes for the next generation of trendsetters.",
      "Bags": "The perfect companions for your ZORD shoes. Crafted with the same premium materials.",
      "Accessories": "Elevate your look with our curated range of shoe care and style accessories.",
      "Super Sale": "Exclusive discounts on our most popular models. Limited time only.",
      "ZORD Club": "Join the elite. ZORD Club members get early access to new drops and exclusive discounts.",
      "Track Order": "Stay updated on your shipment. Enter your tracking number to see the real-time status.",
      "My Account": "Manage your orders, wishlist, and profile settings in your personalized ZORD account.",
      "Write To Us": "We value your feedback. Send us a message and our team will get back to you within 24 hours.",
      "Contact info": "ZORD HQ, Jhang. Email: zordofficialpk@gmail.com",
      "Store Locator": "Find ZORD near you. Use our interactive map to locate the nearest ZORD flagship store.",
      "About": "Learn about the innovation and craftsmanship behind ZORD Footwear.",
      "Collection": "Explore our full range of seasonal and signature collections.",
      "Export Collection": "Our global export lineup, meeting international standards of excellence.",
      "Franchise Program": "Partner with Excellence. Join the ZORD family by opening your own franchise.",
      "About Us": "Founded with a passion for excellence, Zord Pakistan is dedicated to redefining premium footwear.",
      "Investor Relations": "Transparency and growth. Learn about our financial performance and future vision.",
      "ZORD Worldwide": "ZORD's presence across the globe. Delivering excellence to every continent.",
      "ZORD Shoe Museum": "A tribute to the history of footwear and the evolution of ZORD design.",
      "Terms of Service": "Please read our terms carefully. Usage of our site implies agreement.",
      "Refund policy": "At Zord Pakistan, customer satisfaction is our priority. If you are not satisfied with your purchase, please review our policy:\n\n> Returns: You can return a product within 7 days of delivery. The item must be unused and in its original packaging.\n\n> Refunds: Once we receive and inspect the item, we will process your refund within 7-10 working days to your original payment method.\n\n> Non-Returnable: Items on clearance sale or damaged by the user cannot be returned.\n\n> Shipping Cost: Return shipping costs are the responsibility of the customer unless the product received was damaged or incorrect.",
      "Terms and Conditions": "Welcome to Zord Pakistan. By using our website, you agree to:\n\n> Accuracy: Provide accurate information when placing an order.\n\n> Orders: We reserve the right to cancel any order due to stock unavailability or pricing errors.\n\n> Payments: All payments must be made through our authorized payment gateways.\n\n> Intellectual Property: All content on this website is the property of Zord Pakistan.",
      "Payment Options": "Currently we support:\n> Cash on Delivery (COD) – Pay when you receive the parcel\n> Bank Transfer – Advance payment (optional)\n> EasyPaisa / JazzCash – Coming soon\nNo credit/debit cards required.",
      "FAQ's": "Frequently asked questions about sizing, shipping, and returns.",
      "Privacy Policy": "Zord Pakistan values your privacy. This policy outlines how we handle your data:\n\n> Data Collection: We collect your name, contact number, and address only to process your orders.\n\n> Security: We use secure encryption to protect your personal and payment information.\n\n> Third Parties: We do not sell or share your data with third parties, except for courier services for delivery purposes.\n\n> Cookies: Our website uses cookies to enhance your browsing experience.",
      "Shipping": "At Zord Pakistan, we are committed to delivering your orders as quickly and efficiently as possible. Please review our shipping terms below:\n\n> 1. Delivery Timeline\nWithin Lahore: We offer Same Day Delivery for orders placed before 2:00 PM. Orders placed after this time will be delivered the next working day.\nOther Cities (Across Pakistan): Standard delivery takes 3 to 5 working days.\n\n> 2. Shipping Charges\nShipping charges are calculated at checkout based on the delivery location and the weight of the parcel. Any promotional \"Free Shipping\" offers will be clearly mentioned on the product or checkout page.\n\n> 3. Order Tracking\nOnce your order is dispatched, you will receive a confirmation message or email with a tracking number (if applicable) to monitor your shipment's progress.\n\n> 4. Courier Partners\nWe partner with reputable courier services to ensure your package reaches you safely and on time.\n\n> 5. Delivery Address\nPlease ensure that your shipping address and contact number are accurate at the time of placing the order. We are not responsible for delays caused by incorrect or incomplete information.\n\n> 6. Unexpected Delays\nDuring sale periods, public holidays, or extreme weather conditions, delivery might take slightly longer than the estimated time. We appreciate your patience in such cases.",
      "Terms Of Use": "Rules for interacting with our digital platforms."
    };

    const unsubOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sortedOrders = Object.values(data).sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        setOrders(sortedOrders);
      }
    });

    const unsubReviews = onValue(reviewsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setReviews(Object.values(data));
      } else {
        INITIAL_REVIEWS.forEach(review => {
          set(dbRef(db, `reviews/${review.id}`), review);
        });
      }
    });

    const unsubFooter = onValue(footerRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setFooterContent(data);
      else set(dbRef(db, 'footerContent'), DEFAULT_FOOTER);
    });

    const unsubProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setProducts(Object.values(data));
      else INITIAL_PRODUCTS.forEach(p => set(dbRef(db, `products/${p.id}`), p));
    });

    const unsubCategories = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setCategories(Array.isArray(data) ? data : Object.values(data));
      else set(dbRef(db, 'categories'), CATEGORIES);
    });

    const unsubSlides = onValue(slidesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setSlides(Object.values(data));
      else INITIAL_SLIDES.forEach(s => set(dbRef(db, `slides/${s.id}`), s));
    });

    const unsubCollections = onValue(collectionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setCollections(Object.values(data));
      else {
        const initial = [
          { id: '1', name: "Running", image: "/images/hero_clean.png" },
          { id: '2', name: "Streetwear", image: "/images/urban_streetwear.png" },
          { id: '3', name: "Sport", image: "/images/mens_sport.png" }
        ];
        initial.forEach(c => set(dbRef(db, `collections/${c.id}`), c));
      }
    });

    const unsubContent = onValue(contentRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setSiteContent(data);
      else set(dbRef(db, 'siteContent'), {
        about: "ZORD was born from a simple obsession: to create the perfect fusion of athletic performance and urban elegance.",
        shipping: "At Zord Pakistan, we are committed to delivering your orders as quickly and efficiently as possible. Standard delivery takes 3 to 5 working days."
      });
    });

    const unsubAssets = onValue(assetsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setAssets(data);
      else {
        const defaultAssets = ["/images/hero_clean.png", "/images/mens_sport.png", "/images/womens_fashion.png", "/images/urban_streetwear.png", "/images/logo.jpeg"];
        set(dbRef(db, 'assets'), defaultAssets);
      }
    });

    return () => {
      unsubOrders();
      unsubReviews();
      unsubFooter();
      unsubProducts();
      unsubCategories();
      unsubSlides();
      unsubCollections();
      unsubContent();
      unsubAssets();
    };
  }, []);

  const [view, setView] = useState('store');
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [infoPage, setInfoPage] = useState(null); // { title: string, content: string }

  const location = useLocation();
  const navigate = useNavigate();

  const goToCart = () => {
    setIsCartDrawerOpen(false);
    setInfoPage(null);
    setView('checkout');
    if (location.pathname !== '/cart') navigate('/cart');
  };

  const goToStore = () => {
    setInfoPage(null);
    setIsCartDrawerOpen(false);
    setView('store');
    if (location.pathname !== '/') navigate('/');
  };

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Sync URL -> State
  useEffect(() => {
    const path = location.pathname;

    // Only run on actual URL changes, not internal view state changes
    if (path === '/') {
      setView('store');
    } else if (path === '/shop') {
      setView('store');
      setFilterCategory(null);
      setTimeout(() => {
        document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (path === '/cart') {
      setView('checkout');
    } else if (path === '/order-success') {
      setView('order-success');
    } else if (path === '/about') {
      setInfoPage({ title: 'About Us', content: "Founded with a passion for excellence, ZORD is dedicated to redefining the standards of premium footwear globally." });
    } else if (path === '/contact') {
      setInfoPage({ title: 'Contact', content: "Have a question? We're here to help. You can reach us at zordofficialpk@gmail.com or visit our HQ in Pakistan. Our support team is available 24/7." });
    }
  }, [location.pathname, setFilterCategory]);

  // NOTE: Do not auto-navigate based on `view`.
  // The URL should be the source of truth to avoid back-button loops.

  // Auth State
  const [email, setEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('zord_admin_auth') === 'true';
  });
  const ADMIN_EMAIL = "zordofficialpk@gmail.com";

  // Footer Info Content
  const INFO_CONTENT = {
    "Refund policy": "At Zord Pakistan, customer satisfaction is our priority. If you are not satisfied with your purchase, please review our policy:\n\n> Returns: You can return a product within 7 days of delivery. The item must be unused and in its original packaging.\n\n> Refunds: Once we receive and inspect the item, we will process your refund within 7-10 working days to your original payment method.\n\n> Non-Returnable: Items on clearance sale or damaged by the user cannot be returned.\n\n> Shipping Cost: Return shipping costs are the responsibility of the customer unless the product received was damaged or incorrect.",
    "Shipping": "At Zord Pakistan, we are committed to delivering your orders as quickly and efficiently as possible. Please review our shipping terms below:\n\n> 1. Delivery Timeline\nWithin Lahore: We offer Same Day Delivery for orders placed before 2:00 PM. Orders placed after this time will be delivered the next working day.\nOther Cities (Across Pakistan): Standard delivery takes 3 to 5 working days.\n\n> 2. Shipping Charges\nShipping charges are calculated at checkout based on the delivery location and the weight of the parcel. Any promotional \"Free Shipping\" offers will be clearly mentioned on the product or checkout page.\n\n> 3. Order Tracking\nOnce your order is dispatched, you will receive a confirmation message or email with a tracking number (if applicable) to monitor your shipment's progress.\n\n> 4. Courier Partners\nWe partner with reputable courier services to ensure your package reaches you safely and on time.\n\n> 5. Delivery Address\nPlease ensure that your shipping address and contact number are accurate at the time of placing the order. We are not responsible for delays caused by incorrect or incomplete information.\n\n> 6. Unexpected Delays\nDuring sale periods, public holidays, or extreme weather conditions, delivery might take slightly longer than the estimated time. We appreciate your patience in such cases.",
    "Contact": "Have a question? We're here to help. You can reach us at zordofficialpk@gmail.com or visit our HQ in Jhang, Pakistan. Our support team is available 24/7.",
    "Track Order": "Stay updated on your shipment. Enter your tracking number in the field above to see the real-time status of your ZORD Footwear delivery.",
    "ZORD Club": "Join the elite. ZORD Club members get early access to new drops, exclusive discounts, and invitations to private Sneaker Fest events.",
    "Franchise Program": "Partner with Excellence. Join the ZORD family by opening your own franchise. We provide full logistical support, inventory management, and branding assets.",
    "Sneaker Fest": "The ultimate celebration of footwear. Sneaker Fest is our annual event where we showcase limited edition prototypes and rare collaborations.",
    "Store Locator": "Find ZORD near you. Use our interactive map to locate the nearest ZORD flagship store in your city.",
    "About Us": "Founded with a passion for excellence, Zord Pakistan is dedicated to redefining the standards of premium footwear globally.",
    "Terms of Service": "Welcome to Zord Pakistan. By using our website, you agree to:\n\n> Accuracy: Provide accurate information when placing an order.\n\n> Orders: We reserve the right to cancel any order due to stock unavailability or pricing errors.\n\n> Payments: All payments must be made through our authorized payment gateways.\n\n> Intellectual Property: All content on this website is the property of Zord Pakistan.",
    "Terms and Conditions": "Welcome to Zord Pakistan. By using our website, you agree to:\n\n> Accuracy: Provide accurate information when placing an order.\n\n> Orders: We reserve the right to cancel any order due to stock unavailability or pricing errors.\n\n> Payments: All payments must be made through our authorized payment gateways.\n\n> Intellectual Property: All content on this website is the property of Zord Pakistan.",
    "Privacy Policy": "Zord Pakistan values your privacy. This policy outlines how we handle your data:\n\n> Data Collection: We collect your name, contact number, and address only to process your orders.\n\n> Security: We use secure encryption to protect your personal and payment information.\n\n> Third Parties: We do not sell or share your data with third parties, except for courier services for delivery purposes.\n\n> Cookies: Our website uses cookies to enhance your browsing experience."
  };

  const openInfo = (key, displayTitle = null) => {
    const content = INFO_CONTENT[key] || footerContent[key] || `Detailed information for ${key} is coming soon.`;
    setInfoPage({ title: displayTitle || key, content });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBackFromInfo = () => {
    setInfoPage(null);
    setTimeout(() => {
      document.getElementById('site-footer')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const updateFooterContent = (key, value) => {
    set(dbRef(db, `footerContent/${key}`), value);
    setSaveStatus('Draft Saved...');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const deleteFooterPage = (key) => {
    if (window.confirm(`Are you sure you want to delete the "${key}" page?`)) {
      remove(dbRef(db, `footerContent/${key}`));
      setSelectedFooterPage('');
    }
  };

  useEffect(() => {
    if (selectedProduct) {
      trackEvent('view_item', {
        item_name: selectedProduct.name,
        item_id: selectedProduct.id,
        price: selectedProduct.price,
        item_category: selectedProduct.category,
        currency: 'PKR'
      });
    }
  }, [selectedProduct]);

  const addToCart = (product, qty = 1) => {
    const stock = product.stock || {};
    const sizeKey = product.size ? String(product.size) : null;
    const stockForSize = sizeKey && stock[sizeKey] !== undefined ? parseInt(stock[sizeKey]) : 999;

    if (stockForSize <= 0) {
      setToastMessage(`❌ Size ${product.size} is out of stock.`);
      return;
    }

    const alreadyInCart = cart.filter(i => i.id === product.id && String(i.size) === sizeKey).length;
    if (alreadyInCart + qty > stockForSize) {
      setToastMessage(`⚠️ Only ${stockForSize} unit(s) available for Size ${product.size}. You have ${alreadyInCart} in cart.`);
      return;
    }

    const newItems = Array.from({ length: qty }, () => ({ ...product, cartId: Date.now() + Math.random() }));
    setCart(prev => [...prev, ...newItems]);
    trackEvent('add_to_cart', { item_name: product.name, item_id: product.id, price: product.price, currency: 'PKR', quantity: qty });
    setToastMessage(`✅ ${qty}x ${product.name} (Size ${product.size}) added to cart!`);
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const sendEmailNotification = (order) => {
    // NOTE: You need to create an account at emailjs.com to get these IDs
    const serviceId = 'service_d5g2dmv';
    const templateId = 'template_5ztalco';
    const publicKey = 'AkNHqN4Eyi7XxdtC5';

    const templateParams = {
      order_id: order.id,
      customer_name: order.customer.name,
      customer_phone: order.customer.phone,
      customer_address: order.customer.address,
      order_total: `Rs. ${order.total.toLocaleString()}`,
      order_items: order.items.map(item => `${item.name} (Size: ${item.size})`).join(', ')
    };

    emailjs.send(serviceId, templateId, templateParams, publicKey)
      .then((result) => {
        console.log('Email successfully sent!', result.text);
      }, (error) => {
        console.error('Email failed to send...', error.text);
      });
  };

  const placeOrder = (customerInfo) => {
    // Basic validation for phone number (should be at least 11 digits for Pakistan)
    const phoneDigits = customerInfo.phone.replace(/\D/g, '');
    if (phoneDigits.length < 11) {
      setToastMessage("⚠️ Please enter a valid 11-digit phone number.");
      return;
    }

    const orderId = `ORD-${Date.now()}`;
    const newOrder = {
      id: orderId,
      items: cart,
      total: cart.reduce((acc, item) => acc + item.price, 0),
      customer: customerInfo,
      status: 'Pending',
      paymentMethod: customerInfo.payment || 'COD',
      timestamp: new Date().toISOString()
    };
    set(dbRef(db, `orders/${orderId}`), newOrder);
    sendEmailNotification(newOrder); // Send email alert to admin
    trackEvent('purchase', { transaction_id: orderId, value: newOrder.total, currency: 'PKR', items: cart });
    setLastOrderId(orderId);
    setCart([]);
    setView('order-success');
    window.scrollTo(0, 0);
  };



  const updateOrderStatus = (id, status) => {
    set(dbRef(db, `orders/${id}/status`), status);
  };

  const deleteOrder = (id) => {
    if (window.confirm("Delete this order?")) {
      remove(dbRef(db, `orders/${id}`));
    }
  };

  const removeReview = (id) => {
    if (window.confirm("Remove this review from the website?")) {
      remove(dbRef(db, `reviews/${id}`));
    }
  };

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    const reviewId = `REV-${Date.now()}`;
    const reviewData = {
      ...newReview,
      id: reviewId,
      date: 'Just now'
    };
    set(dbRef(db, `reviews/${reviewId}`), reviewData);
    setNewReview({ name: '', location: '', rating: 5, comment: '' });
    setIsReviewModalOpen(false);
    setToastMessage('Review submitted successfully! Thank you.');
  };

  const handleTrack = () => {
    setTrackError('');
    setTrackedOrder(null);
    if (!trackQuery.trim()) { setTrackError('Please enter your Order ID or phone number.'); return; }
    setIsTracking(true);
    const q = trackQuery.trim().toLowerCase();
    const found = orders.find(o =>
      o.id?.toLowerCase() === q ||
      (o.customer?.phone && o.customer.phone.replace(/\s|-/g, '') === q.replace(/\s|-/g, ''))
    );
    setTimeout(() => {
      setIsTracking(false);
      if (found) setTrackedOrder(found);
      else setTrackError('No order found. Please check your Order ID or phone number.');
    }, 1000);
  };

  const [newImageAsset, setNewImageAsset] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', price: '', originalPrice: '', saleEndDate: '', category: '', image: '/images/hero_clean.png', isNewArrival: false });
  const [selectedFooterPage, setSelectedFooterPage] = useState('');
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '', payment: 'COD' });
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // ── PayPal Checkout Integration ──────────────────────────────────────────
  const customerInfoRef = useRef(customerInfo);
  const cartRef = useRef(cart);
  const lastOrderIdRef = useRef(lastOrderId);

  useEffect(() => {
    customerInfoRef.current = customerInfo;
  }, [customerInfo]);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    lastOrderIdRef.current = lastOrderId;
  }, [lastOrderId]);

  useEffect(() => {
    if (view !== 'checkout' || customerInfo.payment !== 'Online') return;

    let isMounted = true;
    const paypalContainerId = 'paypal-button-container';

    const loadAndRenderPayPal = () => {
      const container = document.getElementById(paypalContainerId);
      if (!container || !isMounted) return;

      container.innerHTML = ''; // Clear previous button instance

      if (!window.paypal) {
        console.error('PayPal SDK not loaded');
        return;
      }

      window.paypal.Buttons({
        style: {
          layout: 'vertical',
          color:  'gold',
          shape:  'rect',
          label:  'paypal'
        },
        onClick: (data, actions) => {
          // Perform validation before starting PayPal checkout
          const currentCustomer = customerInfoRef.current;
          const phoneDigits = currentCustomer.phone.replace(/\D/g, '');

          if (!currentCustomer.name.trim()) {
            setToastMessage('⚠️ Please enter your full name.');
            return actions.reject();
          }
          if (phoneDigits.length < 11) {
            setToastMessage('⚠️ Please enter a valid 11-digit phone number.');
            return actions.reject();
          }
          if (!currentCustomer.city || !currentCustomer.city.trim()) {
            setToastMessage('⚠️ Please enter your city.');
            return actions.reject();
          }
          if (!currentCustomer.address.trim()) {
            setToastMessage('⚠️ Please enter your delivery address.');
            return actions.reject();
          }
          if (cartRef.current.length === 0) {
            setToastMessage('⚠️ Your cart is empty.');
            return actions.reject();
          }

          return actions.resolve();
        },
        createOrder: async () => {
          setIsPaymentLoading(true);
          setPaymentError('');
          setToastMessage('🔒 Connecting to PayPal...');

          const currentCart = cartRef.current;
          const currentCustomer = customerInfoRef.current;
          const totalAmount = currentCart.reduce((a, b) => a + b.price, 0);
          const orderId = `ORD-${Date.now()}`;

          // 1. Create a pending order in Firebase first
          const pendingOrder = {
            id: orderId,
            items: currentCart,
            total: totalAmount,
            customer: currentCustomer,
            status: 'Pending',
            paymentMethod: 'Online (PayPal)',
            paymentStatus: 'Awaiting',
            timestamp: new Date().toISOString()
          };

          try {
            await set(dbRef(db, `orders/${orderId}`), pendingOrder);
            setLastOrderId(orderId);
            lastOrderIdRef.current = orderId; // Update ref immediately

            // 2. Call backend to create PayPal order
            const res = await createPayPalOrder({ orderId, amount: totalAmount });
            if (res.error) {
              throw new Error(res.error);
            }
            if (!res.id) {
              throw new Error('Failed to create order on PayPal');
            }
            setIsPaymentLoading(false);
            return res.id;
          } catch (err) {
            setIsPaymentLoading(false);
            setPaymentError(err.message);
            setToastMessage(`❌ Error: ${err.message}`);
            return Promise.reject(err);
          }
        },
        onApprove: async (data, actions) => {
          setIsPaymentLoading(true);
          setToastMessage('🔒 Verifying payment with PayPal...');

          try {
            const res = await capturePayPalOrder({
              paypalOrderId: data.orderID,
              orderId: lastOrderIdRef.current
            });

            setIsPaymentLoading(false);

            if (res.success) {
              const currentCart = cartRef.current;
              const currentCustomer = customerInfoRef.current;
              const totalAmount = currentCart.reduce((a, b) => a + b.price, 0);

              trackEvent('purchase', {
                transaction_id: lastOrderIdRef.current,
                value: totalAmount,
                currency: 'PKR',
                items: currentCart
              });

              sendEmailNotification({
                id: lastOrderIdRef.current,
                customer: currentCustomer,
                total: totalAmount,
                items: currentCart
              });

              setCart([]);
              setView('order-success');
              window.scrollTo(0, 0);
              setToastMessage('🎉 Payment received! Order placed successfully.');
            } else {
              throw new Error(res.error || 'Payment verification failed');
            }
          } catch (err) {
            setIsPaymentLoading(false);
            setPaymentError(err.message);
            setToastMessage(`❌ Payment capture failed: ${err.message}`);
          }
        },
        onError: (err) => {
          console.error('PayPal Error:', err);
          setIsPaymentLoading(false);
          setPaymentError('PayPal encountered an error. Please try again or choose Cash on Delivery.');
          setToastMessage('❌ PayPal error occurred.');
        }
      }).render(`#${paypalContainerId}`);
    };

    // Load PayPal script dynamically
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb';
    const scriptId = 'paypal-sdk-script';
    let script = document.getElementById(scriptId);

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
      script.async = true;
      script.onload = () => {
        if (isMounted) loadAndRenderPayPal();
      };
      document.body.appendChild(script);
    } else {
      if (window.paypal) {
        loadAndRenderPayPal();
      } else {
        script.onload = () => {
          if (isMounted) loadAndRenderPayPal();
        };
      }
    }

    return () => {
      isMounted = false;
    };
  }, [view, customerInfo.payment]);


  const [newCollection, setNewCollection] = useState({ name: '', image: '' });

  const addCollection = (e) => {
    e.preventDefault();
    if (newCollection.name && newCollection.image) {
      const id = Date.now().toString();
      set(dbRef(db, `collections/${id}`), { ...newCollection, id });
      setNewCollection({ name: '', image: '' });
      setToastMessage('Collection added!');
    }
  };

  const removeCollection = (id) => {
    remove(dbRef(db, `collections/${id}`));
  };

  const updateCollection = (id, field, value) => {
    set(dbRef(db, `collections/${id}/${field}`), value);
  };

  const updateContent = (field, value) => {
    set(dbRef(db, `siteContent/${field}`), value);
  };

  // CRUD Actions for Firebase
  const addImageAsset = (e) => {
    e.preventDefault();
    if (newImageAsset && !assets.includes(newImageAsset)) {
      set(dbRef(db, 'assets'), [...assets, newImageAsset]);
      setNewImageAsset('');
    }
  };

  const addProduct = async (e) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let mainImageUrl = '/images/hero_clean.png';
      let hoverImageUrl = '';

      const compressAndUpload = async (file) => {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true, fileType: 'image/webp' };
        const compressedFile = await imageCompression(file, options);
        const uniqueName = `${Date.now()}_${compressedFile.name.replace(/\.[^/.]+$/, "")}.webp`;
        const fileRef = storageRef(storage, `products/${uniqueName}`);
        await uploadBytes(fileRef, compressedFile);
        return await getDownloadURL(fileRef);
      };

      if (imageFile) mainImageUrl = await compressAndUpload(imageFile);
      else if (imageUrlInput) mainImageUrl = imageUrlInput.trim();

      if (hoverImageFile) hoverImageUrl = await compressAndUpload(hoverImageFile);
      else if (hoverImageUrlInput) hoverImageUrl = hoverImageUrlInput.trim();

      const uploadedUrls = [mainImageUrl];
      if (extraImageFiles.length > 0) {
        for (const file of extraImageFiles) {
          const url = await compressAndUpload(file);
          uploadedUrls.push(url);
        }
      }

      if (extraImageUrlInput.trim()) {
        const urls = extraImageUrlInput.split(',').map(u => u.trim()).filter(u => u);
        uploadedUrls.push(...urls);
      }

      const id = Date.now().toString();
      const sizesArray = newProduct.availableSizes && newProduct.availableSizes.length > 0 ? newProduct.availableSizes : ['39', '40', '41', '42', '43', '44', '45'];

      const product = {
        ...newProduct,
        id,
        price: parseFloat(newProduct.price),
        originalPrice: newProduct.originalPrice ? parseFloat(newProduct.originalPrice) : null,
        rating: 5.0,
        availableSizes: sizesArray,
        stock: newProduct.stock || {},
        image: mainImageUrl,
        hoverImage: hoverImageUrl || mainImageUrl,
        images: uploadedUrls,
        isNewArrival: newProduct.isNewArrival || false,
        saleEndDate: newProduct.saleEndDate || null
      };

      set(dbRef(db, `products/${id}`), product);
      setNewProduct({ name: '', price: '', originalPrice: '', saleEndDate: '', category: categories[0] || '', image: '', availableSizes: [], stock: {}, isNewArrival: false });
      setImageUrlInput('');
      setHoverImageUrlInput('');
      setExtraImageUrlInput('');
      setImageFile(null);
      setExtraImageFiles([]);
      setHoverImageFile(null);
      setToastMessage('Product added successfully!');
    } catch (error) {
      console.error("Error saving product:", error);
      setToastMessage("❌ Product saving failed. Please check your connection.");
    }

    setIsUploading(false);
  };

  const removeProduct = (id) => {
    remove(dbRef(db, `products/${id}`));
  };

  const toggleNewArrival = (id, currentStatus) => {
    set(dbRef(db, `products/${id}/isNewArrival`), !currentStatus);
  };

  const updateProductField = (id, field, value) => {
    set(dbRef(db, `products/${id}/${field}`), value);
  };

  const addSlide = () => {
    const id = Date.now();
    const newSlide = { id, title: "New Title", subtitle: "Description", image: "/images/hero_clean.png", cta: "Learn More" };
    set(dbRef(db, `slides/${id}`), newSlide);
  };

  const removeSlide = (id) => {
    if (slides.length > 1) remove(dbRef(db, `slides/${id}`));
  };

  const updateSlide = (id, field, value) => {
    set(dbRef(db, `slides/${id}/${field}`), value);
  };

  useEffect(() => {
    if (view === 'store' && slides.length > 0) {
      const timer = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % slides.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [view, slides.length]);

  // Auth Actions
  const handleLogin = (e) => {
    e.preventDefault();
    const inputEmail = email.trim().toLowerCase();
    if (inputEmail === ADMIN_EMAIL.toLowerCase()) {
      setIsAuthenticated(true);
      localStorage.setItem('zord_admin_auth', 'true');
      setView('admin');
      setToastMessage("🔓 Welcome back, Admin!");
    } else {
      setToastMessage("❌ Unauthorized Access.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('zord_admin_auth');
    setView('store');
    setEmail('');
  };

  const handleExtraImageUpload = async (productId, files) => {
    setIsUploading(true);
    try {
      const product = products.find(p => p.id === productId);
      const currentImages = product.images || [product.image];
      const newUrls = [...currentImages];

      const compressAndUpload = async (file) => {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true, fileType: 'image/webp' };
        const compressedFile = await imageCompression(file, options);
        const uniqueName = `${Date.now()}_${compressedFile.name.replace(/\.[^/.]+$/, "")}.webp`;
        const fileRef = storageRef(storage, `products/${uniqueName}`);
        await uploadBytes(fileRef, compressedFile);
        return await getDownloadURL(fileRef);
      };

      for (const file of Array.from(files)) {
        const url = await compressAndUpload(file);
        newUrls.push(url);
      }

      updateProductField(productId, 'images', newUrls);
      setToastMessage(`✅ ${files.length} images added to ${product.name}!`);
    } catch (error) {
      console.error("Error uploading extra images:", error);
      setToastMessage("❌ Image upload failed.");
    }
    setIsUploading(false);
  };

  const handleCategorySelect = (categoryName) => {
    setFilterCategory(categoryName);
    // Clear advanced category filter to avoid conflict
    setAdvancedFilters(prev => ({ ...prev, category: '' }));
    setTimeout(() => {
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleImageError = (e) => {
    e.target.src = '/logo.png';
    e.target.classList.add('image-placeholder');
  };

  // Product Modal
  const renderProductModal = () => {
    if (!selectedProduct) return null;
    const images = selectedProduct.images || [selectedProduct.image];

    return (
      <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
        <div className="product-modal card-styled animate-scale-up" onClick={e => e.stopPropagation()}>
          <div className="modal-header-nav">
            <button className="btn-minimal-back" onClick={() => setSelectedProduct(null)}>
              <i className="fas fa-arrow-left"></i> Back to Collection
            </button>
          </div>
          <div className="modal-grid">
            <div className="modal-image-gallery">
              <div className="main-image-container">
                <div className="main-image">
                  <img src={images[activeGalleryIndex]} alt={selectedProduct.name} loading="lazy" onError={handleImageError} />
                </div>
                {images.length > 1 && (
                  <div className="mobile-gallery-dots">
                    {images.map((_, idx) => (
                      <span
                        key={idx}
                        className={`dot ${activeGalleryIndex === idx ? 'active' : ''}`}
                        onClick={() => setActiveGalleryIndex(idx)}
                      ></span>
                    ))}
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="thumbnail-grid-wrapper">
                  <div className="thumbnail-grid">
                    {images.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className={`thumbnail ${activeGalleryIndex === idx ? 'active' : ''}`}
                        onClick={() => setActiveGalleryIndex(idx)}
                      >
                        <img src={imgUrl} alt={`${selectedProduct.name} view ${idx + 1}`} loading="lazy" onError={handleImageError} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-info">
              <p className="product-category">{selectedProduct.category}</p>
              <h1 className="section-title">{selectedProduct.name}</h1>
              <div className="price-tag-wrapper">
                {selectedProduct.originalPrice > selectedProduct.price && (
                  <span className="original-price">Rs. {selectedProduct.originalPrice.toLocaleString()}</span>
                )}
                <span className="price-tag">Rs. {selectedProduct.price.toLocaleString()}</span>
                {calculateDiscount(selectedProduct.price, selectedProduct.originalPrice) && (
                  <span className="discount-pill">-{calculateDiscount(selectedProduct.price, selectedProduct.originalPrice)}% OFF</span>
                )}
              </div>

              <div className="size-selector mt-2">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p><strong>Select Size (EU)</strong></p>
                  <button onClick={() => setIsSizeGuideOpen(true)} style={{ background: 'none', border: 'none', color: '#4A1A3E', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}>Size Guide</button>
                </div>
                <div className="size-grid">
                  {[39, 40, 41, 42, 43, 44, 45].map(size => {
                    const isAvailable = !selectedProduct.availableSizes ||
                      selectedProduct.availableSizes.length === 0 ||
                      selectedProduct.availableSizes.includes(size.toString()) ||
                      selectedProduct.availableSizes.includes(size);
                    const stockQty = selectedProduct.stock && selectedProduct.stock[String(size)] !== undefined
                      ? parseInt(selectedProduct.stock[String(size)])
                      : (isAvailable ? 999 : 0);
                    const inStock = isAvailable && stockQty > 0;
                    return (
                      <button
                        key={size}
                        className={`size-btn ${selectedSize === size ? 'active' : ''} ${!inStock ? 'out-of-stock' : ''}`}
                        onClick={() => { if (inStock) { setSelectedSize(size); setSelectedQty(1); } }}
                        disabled={!inStock}
                        title={!inStock ? 'Out of Stock' : `${stockQty < 999 ? stockQty + ' left' : 'Available'}`}
                      >
                        {size}
                        {!inStock && <span className="oos-label">OOS</span>}
                        {inStock && stockQty <= 5 && stockQty < 999 && <span className="oos-label" style={{ background: '#e67e22' }}>Low</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="story-text mt-2">Experience the fusion of high-performance technology and street-ready style. Crafted with premium breathable mesh and a responsive cushioning sole, this {selectedProduct.name} is designed for all-day comfort and elite durability.</p>

              {selectedSize ? (
                <>
                  {/* Stock info + Quantity Picker */}
                  {(() => {
                    const stockQty = selectedProduct.stock && selectedProduct.stock[String(selectedSize)] !== undefined
                      ? parseInt(selectedProduct.stock[String(selectedSize)])
                      : 999;
                    const maxQty = stockQty < 999 ? stockQty : 10;
                    return (
                      <div className="modal-actions mt-2 animate-fade-in">
                        {stockQty < 999 && (
                          <p style={{ fontSize: '0.85rem', color: stockQty <= 5 ? '#e67e22' : '#27ae60', fontWeight: '600', marginBottom: '0.75rem' }}>
                            {stockQty <= 0 ? '❌ Out of stock' : stockQty <= 5 ? `⚠️ Only ${stockQty} left in stock!` : `✅ In Stock (${stockQty} available)`}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>Quantity:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '2px solid #4A1A3E', borderRadius: '8px', overflow: 'hidden' }}>
                            <button
                              onClick={() => setSelectedQty(q => Math.max(1, q - 1))}
                              style={{ padding: '6px 14px', background: '#4A1A3E', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}
                            >−</button>
                            <span style={{ padding: '6px 18px', fontWeight: '700', fontSize: '1rem', minWidth: '40px', textAlign: 'center' }}>{selectedQty}</span>
                            <button
                              onClick={() => setSelectedQty(q => Math.min(maxQty, q + 1))}
                              style={{ padding: '6px 14px', background: '#4A1A3E', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}
                              disabled={selectedQty >= maxQty}
                            >+</button>
                          </div>
                          <span style={{ fontSize: '0.85rem', color: '#888' }}>Rs. {(selectedProduct.price * selectedQty).toLocaleString()}</span>
                        </div>
                        <button
                          className="btn btn-primary w-100"
                          onClick={() => {
                            addToCart({ ...selectedProduct, size: selectedSize }, selectedQty);
                            setSelectedProduct(null);
                            setSelectedSize(null);
                            setSelectedQty(1);
                            setIsCartDrawerOpen(true);
                          }}
                        >
                          ADD TO CART
                        </button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="modal-actions mt-2">
                  <button className="btn btn-secondary w-100" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    SELECT A SIZE
                  </button>
                </div>
              )}
              <div className="whatsapp-inquiry-section mt-3">
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem' }}>Ask about this product</h4>
                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>Have questions about this product? Contact us via WhatsApp!</p>
                <a
                  href={`https://wa.me/923061412735?text=${encodeURIComponent(`Hi ZORD! I'm interested in the ${selectedProduct.name}${selectedSize ? ` (Size: ${selectedSize})` : ''}. Can you provide more details?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whatsapp-inquiry-btn"
                  onClick={() => trackEvent('whatsapp_click', { product_name: selectedProduct.name, size: selectedSize })}
                >
                  <i className="fab fa-whatsapp"></i> Ask about this product
                </a>
              </div>

              <CustomerReviews productId={selectedProduct.id} reviews={reviews} />
            </div>
          </div>
        </div>
        {isSizeGuideOpen && <SizeGuide onClose={() => setIsSizeGuideOpen(false)} />}
      </div>
    );
  };

  // Checkout View
  if (view === 'checkout') {
    const totalAmount = cart.reduce((a, b) => a + b.price, 0);
    return (
      <div className="checkout-page animate-fade-in">
        <nav className="navbar scrolled" style={{ position: 'relative', top: 0 }}>
          <div className="container nav-container">
            <div className="logo" onClick={goToStore} style={{ cursor: 'pointer' }}>
              <img src="/images/logo.jpeg" alt="Logo" className="logo-img" />
              <span className="logo-text">ZORD</span>
            </div>
            <button className="btn-minimal-back" onClick={goToStore}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
        </nav>

        <div className="checkout-steps" style={{ marginTop: '2rem' }}>
          <div className="step active"><span>1</span> Cart</div>
          <div className="step-line"></div>
          <div className="step active"><span>2</span> Delivery</div>
          <div className="step-line"></div>
          <div className="step"><span>3</span> Confirm</div>
        </div>

        <div className="checkout-wrapper" style={{ paddingTop: '1rem' }}>
          <div className="checkout-grid">
            {/* Left — Form */}
            <div className="checkout-form-container">
              <div className="checkout-section-label">
                <i className="fas fa-map-marker-alt"></i> Delivery Information
              </div>
              <form className="checkout-form-new" onSubmit={(e) => { e.preventDefault(); placeOrder(customerInfo); }}>
                <div className="form-field">
                  <label>Full Name</label>
                  <input type="text" name="name" autoComplete="name" placeholder="e.g. Ali Hassan" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} required />
                </div>
                <div className="form-field">
                  <label>Phone Number</label>
                  <input type="tel" inputMode="tel" name="tel" autoComplete="tel" placeholder="03001234567" value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} required pattern="[0-9]{11,}" title="Please enter at least 11 digits" />
                </div>
                <div className="form-field">
                  <label>City</label>
                  <input type="text" name="city" autoComplete="address-level2" placeholder="e.g. Lahore" value={customerInfo.city || ''} onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })} required />
                </div>
                <div className="form-field">
                  <label>Delivery Address</label>
                  <textarea name="address" autoComplete="street-address" placeholder="Street, Area, Landmark..." value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} required rows="3"></textarea>
                </div>
                <div className="form-field">
                  <label>Order Notes <span style={{ color: '#999', fontWeight: '400' }}>(optional)</span></label>
                  <textarea name="notes" placeholder="Special instructions..." value={customerInfo.notes || ''} onChange={e => setCustomerInfo({ ...customerInfo, notes: e.target.value })} rows="2"></textarea>
                </div>

                <div className="checkout-section-label" style={{ marginTop: '1.5rem' }}>
                  <i className="fas fa-credit-card"></i> Payment Method
                </div>
                <div className="payment-options">
                  <label className={`payment-option ${customerInfo.payment === 'COD' ? 'selected' : ''}`}>
                    <input type="radio" name="payment" value="COD" checked={customerInfo.payment === 'COD'} onChange={e => setCustomerInfo({ ...customerInfo, payment: e.target.value })} />
                    <i className="fas fa-money-bill-wave"></i>
                    <div>
                      <strong>Cash on Delivery</strong>
                      <p>Pay when you receive</p>
                    </div>
                  </label>
                  <label className={`payment-option ${customerInfo.payment === 'Online' ? 'selected' : ''}`} style={customerInfo.payment === 'Online' ? { borderColor: '#0070ba', background: 'rgba(0,112,186,0.08)' } : {}}>
                    <input type="radio" name="payment" value="Online" checked={customerInfo.payment === 'Online'} onChange={e => { setCustomerInfo({ ...customerInfo, payment: e.target.value }); setPaymentError(''); }} />
                    <i className="fab fa-paypal" style={{ color: customerInfo.payment === 'Online' ? '#0070ba' : undefined }}></i>
                    <div>
                      <strong>PayPal or Credit/Debit Card</strong>
                      <p>Pay securely via PayPal portal</p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '1.6rem' }}>
                      <i className="fab fa-cc-visa" style={{ color: '#1a1f71' }}></i>
                      <i className="fab fa-cc-mastercard" style={{ color: '#eb001b' }}></i>
                      <i className="fab fa-paypal" style={{ color: '#003087' }}></i>
                    </div>
                  </label>
                </div>

                {/* PayPal USD Conversion Notice */}
                {customerInfo.payment === 'Online' && (
                  <div style={{ marginTop: '1rem', background: 'rgba(0,112,186,0.06)', border: '1px solid rgba(0,112,186,0.2)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <i className="fab fa-paypal" style={{ color: '#003087', fontSize: '1.4rem', marginTop: '3px' }}></i>
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>💳 USD Payment Conversion</strong>
                        <p style={{ fontSize: '0.82rem', color: '#555', marginTop: '2px' }}>
                          PayPal does not support PKR directly. Your total of <strong>Rs. {totalAmount.toLocaleString()} PKR</strong> will be converted to approx <strong>${(totalAmount / parseFloat(import.meta.env.VITE_PAYPAL_EXCHANGE_RATE || '280')).toFixed(2)} USD</strong> (Exchange Rate: 1 USD = {import.meta.env.VITE_PAYPAL_EXCHANGE_RATE || '280'} PKR).
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Right — Order Summary */}
            <div className="order-summary-new">
              <div className="checkout-section-label">
                <i className="fas fa-shopping-bag"></i> Order Summary
              </div>
              <div className="order-items-list">
                {(() => {
                  const grouped = [];
                  cart.forEach(item => {
                    const key = `${item.id}_${item.size}`;
                    const ex = grouped.find(g => g.key === key);
                    if (ex) ex.qty += 1; else grouped.push({ key, item, qty: 1 });
                  });
                  return grouped.map(({ key, item, qty }) => (
                    <div key={key} className="order-item-row">
                      <img src={item.image} alt={item.name} />
                      <div className="order-item-info">
                        <p className="order-item-name">{item.name}</p>
                        <p className="order-item-meta">Size {item.size} &bull; Qty {qty}</p>
                      </div>
                      <span className="order-item-price">Rs. {(item.price * qty).toLocaleString()}</span>
                    </div>
                  ));
                })()}
              </div>
              <div className="order-total-block">
                <div className="order-total-row"><span>Subtotal</span><span>Rs. {totalAmount.toLocaleString()}</span></div>
                <div className="order-total-row"><span>Shipping</span><span style={{ color: '#27ae60' }}>Free</span></div>
                <div style={{ fontSize: '12px', color: '#777', textAlign: 'left', marginTop: '-4px', marginBottom: '8px' }}>
                  Estimated delivery: 3–5 working days
                </div>
                <div className="order-total-row grand-total"><span>Total</span><span>Rs. {totalAmount.toLocaleString()}</span></div>
              </div>
              {customerInfo.payment === 'Online' ? (
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div id="paypal-button-container" style={{ minHeight: '120px', width: '100%' }}></div>
                  {isPaymentLoading && (
                    <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', margin: '0.5rem 0' }}>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                      Processing... Please wait.
                    </div>
                  )}
                  {paymentError && (
                    <div style={{ padding: '0.7rem 1rem', background: 'rgba(229,57,53,0.08)', border: '1px solid rgba(229,57,53,0.25)', borderRadius: '8px', fontSize: '0.85rem', color: '#c62828', textAlign: 'left' }}>
                      <i className="fas fa-exclamation-triangle"></i> {paymentError}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => placeOrder(customerInfo)}
                  className="checkout-place-order-btn"
                >
                  <i className="fas fa-lock"></i> Place Order — Rs. {totalAmount.toLocaleString()}
                </button>
              )}
              <p className="checkout-trust">🔒 Secure &amp; Encrypted &nbsp;|&nbsp; 📦 Free Delivery</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Order Success View
  if (view === 'order-success') {
    return (
      <div className="success-page animate-fade-in">
        <div className="container py-section text-center">
          <div className="success-icon"><i className="fas fa-check-circle"></i></div>
          <h1 className="section-title">Order Placed Successfully!</h1>
          <p className="story-text">Thank you for choosing ZORD. Your premium footwear is being prepared. You will receive a confirmation call shortly.</p>
          {lastOrderId && (
            <div className="order-id-box">
              <p className="order-id-label">Your Order ID</p>
              <p className="order-id-value">{lastOrderId}</p>
              <p className="order-id-hint">📋 Save this ID to track your order anytime.</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            <button onClick={() => setView('track-order')} className="btn btn-secondary">Track My Order</button>
            <button onClick={() => setView('store')} className="btn btn-primary">Back to Shop</button>
          </div>
        </div>
      </div>
    );
  }

  // Track Order View
  if (view === 'track-order') {
    const stepIndex = trackedOrder ? STATUS_STEPS.indexOf(trackedOrder.status) : -1;

    return (
      <div className="track-order-page animate-fade-in">
        <nav className="navbar scrolled" style={{ top: '34px' }}>
          <div className="container nav-container">
            <div className="logo" onClick={() => setView('store')} style={{ cursor: 'pointer' }}>
              <img src="/images/logo.jpeg" alt="ZORD Logo" className="logo-img" />
              <span className="logo-text">ZORD</span>
            </div>
            <button className="btn btn-secondary" onClick={() => setView('store')} style={{ fontSize: '0.85rem' }}>
              <i className="fas fa-arrow-left" style={{ marginRight: '0.5rem' }}></i> Back to Store
            </button>
          </div>
        </nav>

        <div className="announcement-bar">
          <div className="announcement-track">
            🎉 GRAND OPENING SALE &nbsp;•&nbsp; 20% OFF All Products &nbsp;•&nbsp; Use Code: <strong>ZORD20</strong> &nbsp;•&nbsp; Free Delivery on Orders Above PKR 2000 &nbsp;•&nbsp; 🎉 GRAND OPENING SALE &nbsp;•&nbsp; 20% OFF All Products &nbsp;•&nbsp; Use Code: <strong>ZORD20</strong> &nbsp;•&nbsp;
          </div>
        </div>

        <div className="container track-order-container">
          {/* Header */}
          <div className="track-order-header">
            <div className="track-order-icon"><i className="fas fa-shipping-fast"></i></div>
            <h1>Track Your Order</h1>
            <p>Enter your Order ID or the phone number used at checkout to track your ZORD order.</p>
          </div>

          {/* Search Box */}
          <div className="track-search-box">
            <div className="track-input-group">
              <i className="fas fa-search track-search-icon"></i>
              <input
                type="text"
                className="track-input"
                placeholder="e.g. ORD-1713400000000 or 03061412735"
                value={trackQuery}
                onChange={e => setTrackQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTrack()}
              />
            </div>
            <button className="btn btn-primary track-btn" onClick={handleTrack} disabled={isTracking}>
              {isTracking ? <><i className="fas fa-spinner fa-spin"></i> Tracking...</> : 'Track Order'}
            </button>
          </div>

          {/* Error */}
          {trackError && (
            <div className="track-error">
              <i className="fas fa-exclamation-circle"></i> {trackError}
            </div>
          )}

          {/* Result */}
          {trackedOrder && (
            <div className="track-result animate-fade-in">
              {/* Order Info Bar */}
              <div className="track-result-header">
                <div>
                  <span className="track-label">Order ID</span>
                  <span className="track-value">{trackedOrder.id}</span>
                </div>
                <div>
                  <span className="track-label">Placed On</span>
                  <span className="track-value">{new Date(trackedOrder.timestamp).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div>
                  <span className="track-label">Total</span>
                  <span className="track-value">Rs. {trackedOrder.total?.toLocaleString()}</span>
                </div>
                <div>
                  <span className={`track-status-pill status-${trackedOrder.status?.toLowerCase().replace(/ /g, '-')}`}>
                    {trackedOrder.status}
                  </span>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="track-steps-wrapper">
                <div className="track-steps">
                  {STATUS_STEPS.map((step, i) => (
                    <div key={step} className={`track-step ${i <= stepIndex ? 'done' : ''} ${i === stepIndex ? 'active' : ''}`}>
                      <div className="track-step-circle">
                        {i < stepIndex ? <i className="fas fa-check"></i> : <span>{i + 1}</span>}
                      </div>
                      <div className="track-step-line"></div>
                      <span className="track-step-label">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer + Items */}
              <div className="track-details-grid">
                <div className="track-details-card">
                  <h4><i className="fas fa-user"></i> Customer Details</h4>
                  <p><strong>Name:</strong> {trackedOrder.customer?.name}</p>
                  <p><strong>Phone:</strong> {trackedOrder.customer?.phone}</p>
                  <p><strong>Address:</strong> {trackedOrder.customer?.address}</p>
                  <p><strong>Payment:</strong> {trackedOrder.customer?.payment}</p>
                </div>
                <div className="track-details-card">
                  <h4><i className="fas fa-box"></i> Items Ordered</h4>
                  {trackedOrder.items?.map((item, i) => (
                    <div key={i} className="track-item-row">
                      <img src={item.image} alt={item.name} className="track-item-img" />
                      <div>
                        <p className="track-item-name">{item.name}</p>
                        <p className="track-item-meta">Size: {item.size} &nbsp;|&nbsp; Rs. {item.price?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Help */}
              <div className="track-help">
                <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '1.2rem' }}></i>
                Need help? <a href="https://wa.me/923061412735" target="_blank" rel="noopener noreferrer">Chat with us on WhatsApp</a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Icon map for info pages
  const INFO_ICONS = {
    'Privacy Policy': 'fa-shield-alt', 'Refund Policy': 'fa-undo-alt', 'Refund policy': 'fa-undo-alt',
    'Terms of Service': 'fa-file-contract', 'Terms & Conditions': 'fa-gavel', 'Terms and Conditions': 'fa-gavel',
    'About Us': 'fa-building', 'FAQs': 'fa-question-circle', "FAQ's": 'fa-question-circle',
    'Shipping Policy': 'fa-shipping-fast', 'Shipping': 'fa-shipping-fast',
    'Contact Info': 'fa-headset', 'Contact': 'fa-headset', 'Write to Us': 'fa-envelope-open-text',
    'Store Locator': 'fa-map-marker-alt', 'ZORD Club': 'fa-crown', 'Franchise Program': 'fa-handshake',
    'Sneaker Fest': 'fa-fire', 'Payment Options': 'fa-credit-card', 'Super Sale': 'fa-tag',
    'Men': 'fa-male', 'Women': 'fa-female', 'Kids': 'fa-child',
    'Bags': 'fa-shopping-bag', 'Accessories': 'fa-gem', 'Export Collection': 'fa-globe',
  };

  if (infoPage) {
    const pageIcon = INFO_ICONS[infoPage.title] || 'fa-info-circle';
    return (
      <div className="info-page-view animate-fade-in">

        {/* Top Nav */}
        <nav className="navbar scrolled">
          <div className="container nav-container">
            <div className="logo" onClick={goBackFromInfo} style={{ cursor: 'pointer' }}>
              <img src="/images/logo.jpeg" alt="Logo" className="logo-img" />
              <span className="logo-text">ZORD</span>
            </div>
            <button onClick={goBackFromInfo} className="btn-back">
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
        </nav>

        {/* Hero Banner */}
        <div className="info-hero">
          <div className="container info-hero-content">
            <p className="info-breadcrumb">
              <span onClick={goBackFromInfo} style={{ cursor: 'pointer' }}>Home</span>
              <i className="fas fa-chevron-right" style={{ fontSize: '0.6rem', margin: '0 0.6rem', opacity: 0.6 }}></i>
              {infoPage.title}
            </p>
            <div className="info-hero-icon-wrap"><i className={`fas ${pageIcon}`}></i></div>
            <h1 className="info-hero-title">{infoPage.title}</h1>
            <p className="info-hero-sub">Zord Pakistan &nbsp;&bull;&nbsp; Last updated 2026</p>
          </div>
        </div>

        {/* Body */}
        <div className="container info-body">
          {infoPage.title === 'Contact' ? (

            <div className="contact-grid">
              <div className="contact-form-section card-styled" style={{ textAlign: 'left', padding: '2.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem', color: '#4A1A3E' }}>Send Us a Message</h3>
                <form className="contact-form" onSubmit={(e) => { e.preventDefault(); alert('Message sent successfully!'); goBackFromInfo(); }}>
                  <div className="form-field"><label>Full Name</label><input type="text" placeholder="Your Name" required /></div>
                  <div className="form-field"><label>Email Address</label><input type="email" placeholder="you@example.com" required /></div>
                  <div className="form-field"><label>Subject</label><input type="text" placeholder="How can we help?" required /></div>
                  <div className="form-field"><label>Message</label><textarea rows="5" placeholder="Your message..." required></textarea></div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Send Message</button>
                </form>
              </div>
              <div className="contact-info-section">
                <div className="card-styled" style={{ textAlign: 'left', padding: '2rem', marginBottom: '2rem' }}>
                  <h3 style={{ marginBottom: '1.5rem', color: '#4A1A3E' }}>Contact Information</h3>
                  {[
                    ['fa-map-marker-alt', 'Address', 'Post Office Chak No. 255 J.B, Chak No. 250 J.B, Tehsil & District Jhang.'],
                    ['fa-phone-alt', 'Phone', '03061412735'],
                    ['fa-envelope', 'Email', 'zordofficialpk@gmail.com'],
                    ['fa-clock', 'Operating Hours', 'Mon – Sat: 9:00 AM – 6:00 PM'],
                  ].map(([ic, lbl, val]) => (
                    <div key={lbl} className="contact-item">
                      <i className={`fas ${ic}`}></i>
                      <div><strong>{lbl}:</strong><p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.2rem' }}>{val}</p></div>
                    </div>
                  ))}
                </div>
                <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d217759.99380853778!2d74.19430491024036!3d31.48263522521743!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39190483e58107d9%3A0xc23abe6ccc7e2462!2sLahore%2C%20Punjab%2C%20Pakistan!5e0!3m2!1sen!2s!4v1714816000000!5m2!1sen!2s" width="100%" height="260" style={{ border: 0, display: 'block' }} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade"></iframe>
                </div>
              </div>
            </div>

          ) : (

            <div className="info-layout">
              {/* Main Card */}
              <div className="info-main-card">
                <div className="info-main-card-header">
                  <i className={`fas ${pageIcon}`}></i>
                  <h2>{infoPage.title}</h2>
                </div>
                <div className="info-main-card-body">
                  {(() => {
                    const raw = infoPage.content || '';
                    // Split into logical lines (\n or literal \\n)
                    const lines = raw.split(/\n|\\n/);
                    const blocks = [];
                    let listItems = [];

                    const renderInline = (text) => {
                      const parts = text.split(/(\*\*[^*]+\*\*)/);
                      return parts.map((part, i) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={i}>{part.slice(2, -2)}</strong>
                          : part
                      );
                    };

                    const flushList = (key) => {
                      if (listItems.length > 0) {
                        blocks.push(
                          <ul key={`ul-${key}`} className="info-bullet-list">
                            {listItems.map((item, i) => (
                              <li key={i}><i className="fas fa-check-circle"></i><span>{renderInline(item)}</span></li>
                            ))}
                          </ul>
                        );
                        listItems = [];
                      }
                    };

                    lines.forEach((line, idx) => {
                      const trimmed = line.trim();
                      if (trimmed.startsWith('> ') || trimmed.startsWith('>')) {
                        listItems.push(trimmed.replace(/^>\s*/, ''));
                      } else if (trimmed) {
                        flushList(idx);
                        blocks.push(<p key={`p-${idx}`}>{renderInline(trimmed)}</p>);
                      }
                    });
                    flushList('end');

                    return <>{blocks}</>;
                  })()}
                </div>
                <div className="info-main-card-footer">
                  <span className="info-last-updated"><i className="fas fa-calendar-alt"></i> Last updated: January 2026</span>
                  <button onClick={goBackFromInfo} className="btn btn-primary">← Return to Shop</button>
                </div>
              </div>

              {/* Sidebar */}
              <aside className="info-sidebar">
                <div className="info-sidebar-card">
                  <h4><i className="fas fa-headset"></i> Need Help?</h4>
                  <p>Our support team is available Mon–Sat, 9 AM – 6 PM PKT.</p>
                  <a href="https://wa.me/923061412735" target="_blank" rel="noopener noreferrer" className="info-sidebar-btn info-sb-whatsapp">
                    <i className="fab fa-whatsapp"></i> Chat on WhatsApp
                  </a>
                  <a href="mailto:zordofficialpk@gmail.com" className="info-sidebar-btn info-sb-email">
                    <i className="fas fa-envelope"></i> Email Us
                  </a>
                </div>
                <div className="info-sidebar-card" style={{ marginTop: '1.5rem' }}>
                  <h4><i className="fas fa-link"></i> Quick Links</h4>
                  <ul className="info-quick-links">
                    {[['Privacy Policy', 'Privacy Policy'], ['Refund policy', 'Refund Policy'], ['Terms of Service', 'Terms of Service'], ["FAQ's", 'FAQs'], ['Payment Options', 'Payment Options']].map(([key, label]) => (
                      <li key={key}>
                        <a href="#" onClick={(e) => { e.preventDefault(); openInfo(key, label); }}>
                          <i className="fas fa-chevron-right"></i> {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>

          )}
        </div>
      </div>
    );
  }

  // Login View
  if (view === 'login') {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="logo-text">ZORD ADMIN</h1>
          <p>Sign in to manage your digital flagship.</p>
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Admin Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">Login</button>
            <button type="button" onClick={() => setView('store')} className="btn-link mt-1">Back to Shop</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'admin' && isAuthenticated) {
    return (
      <div className="admin-dashboard">
        <nav className="admin-nav">
          <div className="container nav-container">
            <h1 className="logo-text">ZORD ADMIN</h1>
            <div className="nav-actions">
              <button onClick={() => setView('store')} className="btn btn-secondary">Storefront</button>
              <button onClick={handleLogout} className="btn btn-primary">Logout</button>
            </div>
          </div>
        </nav>

        <div className="container admin-content">
          <section className="admin-section">
            <h2>Image Library</h2>
            <form className="add-product-form" onSubmit={addImageAsset}>
              <input
                type="text"
                placeholder="Enter Image URL or Path (e.g. /assets/new.png)"
                value={newImageAsset}
                onChange={e => setNewImageAsset(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">Register Image</button>
            </form>
            <div className="asset-previews">
              {(assets || []).map(asset => (
                <div key={asset} className="asset-thumb">
                  <img src={asset} alt="Thumb" />
                  <span>{asset?.split('/').pop()}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <div className="section-header-admin">
              <h2>Manage Hero Carousel</h2>
              <button onClick={addSlide} className="btn btn-primary">+ Add New Slide</button>
            </div>
            <div className="admin-cards-grid">
              {(slides || []).map(slide => (
                <div key={slide.id} className="admin-edit-card">
                  <div className="preview-container">
                    <img src={slide.image} alt="Slide Preview" className="preview-img" />
                    <button className="btn-remove-float" onClick={() => removeSlide(slide.id)}>&times;</button>
                  </div>
                  <div className="edit-fields">
                    <label>Image URL</label>
                    <input
                      type="text"
                      value={slide.image || ''}
                      onChange={(e) => updateSlide(slide.id, 'image', e.target.value)}
                      placeholder="Paste direct Image URL"
                    />
                    <label>Title</label>
                    <input
                      type="text"
                      value={slide.title || ''}
                      onChange={(e) => updateSlide(slide.id, 'title', e.target.value)}
                      placeholder="Slide Title"
                    />
                    <label>Subtitle</label>
                    <textarea
                      value={slide.subtitle || ''}
                      onChange={(e) => updateSlide(slide.id, 'subtitle', e.target.value)}
                      placeholder="Slide Subtitle"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>Order Management</h2>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Items</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders || []).map(order => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>
                        {order.items && order.items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <img src={item.image} alt={item.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                            <div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{item.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#666' }}>Size: {item.size}</div>
                            </div>
                          </div>
                        ))}
                      </td>
                      <td>
                        <strong>{order.customer?.name || 'Anonymous'}</strong><br />
                        <span style={{ fontSize: '0.8rem' }}>{order.customer?.phone || 'No Phone'}</span><br />
                        <span style={{ fontSize: '0.8rem', color: '#555' }}>{order.customer?.address || 'No Address'}</span>
                      </td>
                      <td>Rs. {(Number(order.total) || 0).toLocaleString()}</td>
                      <td>
                        <select
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="status-select"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn-remove" onClick={() => deleteOrder(order.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section">
            <h2>Review Management</h2>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Author</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(reviews || []).map(review => (
                    <tr key={review.id}>
                      <td>{review.name} ({review.location})</td>
                      <td>{review.rating}/5</td>
                      <td style={{ fontSize: '0.8rem', maxWidth: '300px' }}>{review.comment}</td>
                      <td>
                        <button className="btn-remove" onClick={() => removeReview(review.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section">
            <h2>Manage Footer Pages</h2>
            <div className="edit-fields">
              <label>Select Page to Edit</label>
              <select onChange={(e) => setSelectedFooterPage(e.target.value)} value={selectedFooterPage}>
                <option value="">Select a Page</option>
                {Object.keys(footerContent || {}).sort().map(key => <option key={key} value={key}>{key}</option>)}
              </select>

              {selectedFooterPage && (
                <>
                  <label className="mt-1">Content for {selectedFooterPage}</label>
                  <textarea
                    value={footerContent[selectedFooterPage] || ''}
                    onChange={(e) => updateFooterContent(selectedFooterPage, e.target.value)}
                    rows="10"
                  />
                  <div className="admin-actions mt-1">
                    <button className="btn btn-primary" onClick={() => setSaveStatus('All Changes Saved to Cloud!')}>Save & Publish</button>
                    <button className="btn btn-remove" onClick={() => deleteFooterPage(selectedFooterPage)}>Delete Page</button>
                    {saveStatus && <span className="save-indicator">{saveStatus}</span>}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="admin-section">
            <h2>Manage Collections</h2>
            <form className="add-product-form" onSubmit={addCollection}>
              <input
                type="text"
                placeholder="Collection Name (e.g. Men's Fashion)"
                value={newCollection.name}
                onChange={e => setNewCollection({ ...newCollection, name: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Collection Image URL"
                value={newCollection.image}
                onChange={e => setNewCollection({ ...newCollection, image: e.target.value })}
                required
              />
              <button type="submit" className="btn btn-primary">Add Collection</button>
            </form>

            <div className="admin-cards-grid mt-1">
              {(collections || []).map(col => (
                <div key={col.id} className="admin-edit-card">
                  <div className="preview-container">
                    <img src={col.image} alt="Col Preview" className="preview-img" />
                    <button className="btn-remove-float" onClick={() => removeCollection(col.id)}>&times;</button>
                  </div>
                  <div className="edit-fields">
                    <label>Collection Name</label>
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateCollection(col.id, 'name', e.target.value)}
                    />
                    <label>Image URL</label>
                    <input
                      type="text"
                      value={col.image}
                      onChange={(e) => updateCollection(col.id, 'image', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-section">
            <h2>Manage Site Content</h2>
            <div className="edit-fields">
              <label>About Us Text</label>
              <textarea
                value={siteContent.about}
                onChange={(e) => updateContent('about', e.target.value)}
                rows="4"
              />
              <label>Shipping Policy</label>
              <textarea
                value={siteContent.shipping}
                onChange={(e) => updateContent('shipping', e.target.value)}
                rows="4"
              />
            </div>
          </section>

          <section className="admin-section">
            <h2>Manage Products</h2>
            <form className="add-product-form" onSubmit={addProduct}>
              <input
                type="text"
                placeholder="Name"
                value={newProduct.name}
                onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                required
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Sale Price"
                  value={newProduct.price}
                  onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                  required
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  placeholder="Original Price"
                  value={newProduct.originalPrice || ''}
                  onChange={e => setNewProduct({ ...newProduct, originalPrice: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>
              <input
                type="datetime-local"
                placeholder="Sale End Date"
                value={newProduct.saleEndDate || ''}
                onChange={e => setNewProduct({ ...newProduct, saleEndDate: e.target.value })}
                title="Sale End Date"
              />
              <select
                value={newProduct.category}
                onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
              >
                <option value="">Select Category</option>
                {(collections || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <div className="file-upload-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
                <label>Main Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => { setImageFile(e.target.files[0]); setImageUrlInput(''); }}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <input
                  type="text"
                  placeholder="OR Main Image URL"
                  value={imageUrlInput}
                  onChange={e => { setImageUrlInput(e.target.value); setImageFile(null); }}
                  style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <label>Extra Images (Select Multiple Files)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => setExtraImageFiles(Array.from(e.target.files))}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <label>Extra Image Links (Comma separated)</label>
                <input
                  type="text"
                  placeholder="https://link1.com, https://link2.com"
                  value={extraImageUrlInput}
                  onChange={e => setExtraImageUrlInput(e.target.value)}
                  style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <label>Hover Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => { setHoverImageFile(e.target.files[0]); setHoverImageUrlInput(''); }}
                  style={{ width: '100%', marginBottom: '0.5rem' }}
                />
                <input
                  type="text"
                  placeholder="OR Hover Image URL"
                  value={hoverImageUrlInput}
                  onChange={e => { setHoverImageUrlInput(e.target.value); setHoverImageFile(null); }}
                  style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Images are automatically compressed to WebP and uploaded to Firebase Storage.
                </span>
              </div>
              <div className="admin-size-selector" style={{ marginTop: '0.5rem' }}>
                <label className="text-muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>Available Sizes & Initial Stock</label>
                <div className="size-checkbox-grid" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {['39', '40', '41', '42', '43', '44', '45'].map(size => {
                    const isChecked = Array.isArray(newProduct.availableSizes) && newProduct.availableSizes.includes(size);
                    const stockVal = (newProduct.stock && newProduct.stock[size]) || '';
                    return (
                      <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <label style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isChecked ? '#4A1A3E' : '#fff',
                          color: isChecked ? '#fff' : '#000',
                          fontWeight: '600',
                          border: '2px solid #4A1A3E',
                          fontSize: '0.9rem'
                        }}>
                          <input
                            type="checkbox"
                            style={{ display: 'none' }}
                            checked={isChecked}
                            onChange={(e) => {
                              const currentSizes = Array.isArray(newProduct.availableSizes) ? newProduct.availableSizes : [];
                              if (e.target.checked) {
                                setNewProduct({ ...newProduct, availableSizes: [...currentSizes, size].sort() });
                              } else {
                                setNewProduct({ ...newProduct, availableSizes: currentSizes.filter(s => s !== size) });
                              }
                            }}
                          />
                          {size}
                        </label>
                        {isChecked && (
                          <input
                            type="number"
                            min="0"
                            placeholder="Qty"
                            value={stockVal}
                            onChange={e => {
                              const newStock = { ...(newProduct.stock || {}), [size]: parseInt(e.target.value) || 0 };
                              setNewProduct({ ...newProduct, stock: newStock });
                            }}
                            style={{ width: '52px', padding: '3px 4px', textAlign: 'center', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
                            title={`Initial stock for size ${size}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-new-arrival-toggle" style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}>
                  <input
                    type="checkbox"
                    checked={newProduct.isNewArrival}
                    onChange={e => setNewProduct({ ...newProduct, isNewArrival: e.target.checked })}
                    style={{ width: '20px', height: '20px' }}
                  />
                  Mark as New Arrival
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isUploading}>
                {isUploading ? 'Saving...' : 'Add Product'}
              </button>
            </form>

            <table className="admin-table">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock by Size</th>
                  <th>New Arrival</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(products || []).map(product => (
                  <tr key={product.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                        <img src={product.image} alt={product.name} className="table-img" />
                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 'bold' }}>
                          {product.images ? product.images.length : 1} Images
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <label className="btn-sm btn-secondary" style={{ fontSize: '0.6rem', padding: '2px 6px', cursor: 'pointer' }}>
                            + File
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => handleExtraImageUpload(product.id, e.target.files)}
                            />
                          </label>
                          <button
                            className="btn-sm btn-secondary"
                            style={{ fontSize: '0.6rem', padding: '2px 6px' }}
                            onClick={() => {
                              const url = prompt("Enter image URL:");
                              if (url && url.trim()) {
                                const currentImages = product.images || [product.image];
                                updateProductField(product.id, 'images', [...currentImages, url.trim()]);
                                setToastMessage("✅ Image link added!");
                              }
                            }}
                          >
                            + Link
                          </button>
                        </div>
                        {product.images && product.images.length > 1 && (
                          <button
                            className="text-muted"
                            style={{ background: 'none', border: 'none', fontSize: '0.6rem', textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={() => {
                              if (window.confirm("Reset to only main image?")) {
                                updateProductField(product.id, 'images', [product.image]);
                              }
                            }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={product.name}
                        onChange={(e) => updateProductField(product.id, 'name', e.target.value)}
                        className="inline-input"
                        style={{ width: '150px' }}
                      />
                    </td>
                    <td>
                      <select
                        value={product.category}
                        onChange={(e) => updateProductField(product.id, 'category', e.target.value)}
                        className="inline-input"
                        style={{ width: '120px' }}
                      >
                        {(collections || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.6rem', fontWeight: '800' }}>SALE</label>
                        <input
                          type="number"
                          value={product.price}
                          onChange={(e) => updateProductField(product.id, 'price', parseFloat(e.target.value))}
                          className="inline-input"
                        />
                        <label style={{ fontSize: '0.6rem', fontWeight: '800' }}>ORIGINAL</label>
                        <input
                          type="number"
                          value={product.originalPrice || ''}
                          onChange={(e) => updateProductField(product.id, 'originalPrice', parseFloat(e.target.value))}
                          className="inline-input"
                          placeholder="Original"
                        />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minWidth: '260px' }}>
                        {(product.availableSizes && product.availableSizes.length > 0 ? product.availableSizes : ['39', '40', '41', '42', '43', '44', '45']).map(size => {
                          const stockVal = product.stock && product.stock[String(size)] !== undefined ? product.stock[String(size)] : '';
                          return (
                            <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#4A1A3E' }}>{size}</span>
                              <input
                                type="number"
                                min="0"
                                value={stockVal}
                                placeholder="∞"
                                onChange={e => {
                                  const newStock = { ...(product.stock || {}), [String(size)]: parseInt(e.target.value) || 0 };
                                  updateProductField(product.id, 'stock', newStock);
                                }}
                                style={{ width: '48px', padding: '3px 4px', textAlign: 'center', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
                                title={`Stock for size ${size}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleNewArrival(product.id, product.isNewArrival)}
                        className={`btn-sm ${product.isNewArrival ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                      >
                        {product.isNewArrival ? 'Featured' : 'Regular'}
                      </button>
                    </td>
                    <td>
                      <button onClick={() => removeProduct(product.id)} className="btn-remove">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter(product => {
    // Search by name (using both panel search and global search)
    const combinedSearch = (advancedFilters.search || searchQuery || '').toLowerCase();
    const matchesName = !combinedSearch ||
      product.name?.toLowerCase().includes(combinedSearch) ||
      product.category?.toLowerCase().includes(combinedSearch);

    // Category (Ensure panel selection overrides collection card selection)
    const activeCategory = (advancedFilters.category && advancedFilters.category !== '')
      ? advancedFilters.category
      : (filterCategory || 'All');

    const matchesCategory = activeCategory === 'All' ||
      product.category?.toLowerCase() === activeCategory.toLowerCase() ||
      product.type?.toLowerCase() === activeCategory.toLowerCase() ||
      product.gender?.toLowerCase() === activeCategory.toLowerCase();

    // Size
    const matchesSize = !advancedFilters.size ||
      String(product.size) === String(advancedFilters.size) ||
      (Array.isArray(product.availableSizes) && product.availableSizes.map(String).includes(String(advancedFilters.size)));

    // Price
    const matchesPrice = !advancedFilters.maxPrice ||
      Number(product.price || 0) <= Number(advancedFilters.maxPrice);

    // Color
    const matchesColor = !advancedFilters.color ||
      (product.color && product.color.toLowerCase() === advancedFilters.color.toLowerCase());

    return matchesName && matchesCategory && matchesSize && matchesPrice && matchesColor;
  });

  return (
    <div className="app">
      {showSplash && (
        <div id="splash-screen" className="splash-screen">
          <div className="splash-content">
            <img src="/images/logo.jpeg" alt="ZORD Logo" className="splash-logo" />
            <h1 className="splash-title">Welcome to ZORD</h1>
            <p className="splash-subtitle">Premium Footwear Pakistan</p>
            <button className="btn btn-primary splash-btn" onClick={handleEnterSite}>Enter Site</button>
          </div>
        </div>
      )}
      <SEO
        title={view === 'store' ? (selectedProduct ? selectedProduct.name : 'Shop') : view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ')}
        description={selectedProduct ? selectedProduct.description : undefined}
        image={selectedProduct ? selectedProduct.image : undefined}
      />

      <TrustBar />
      <WhatsAppButton />

      {toastMessage && (
        <div className="toast-notification animate-fade-in">
          <i className="fas fa-check-circle"></i> {toastMessage}
        </div>
      )}

      {renderProductModal()}

      {/* Review Submission Modal */}
      {isReviewModalOpen && (
        <div className="welcome-modal-overlay" onClick={() => setIsReviewModalOpen(false)}>
          <div className="welcome-modal card-styled" onClick={e => e.stopPropagation()}>
            <button className="welcome-modal-close" onClick={() => setIsReviewModalOpen(false)}>&times;</button>
            <h2 className="welcome-modal-title">Share Your <span className="text-plum">Feedback</span></h2>
            <p className="welcome-modal-subtitle">We value your opinion. Tell us about your ZORD experience!</p>

            <form onSubmit={handleReviewSubmit} className="edit-fields">
              <label>Your Name</label>
              <input
                type="text"
                placeholder="Full Name"
                value={newReview.name}
                onChange={e => setNewReview({ ...newReview, name: e.target.value })}
                required
              />
              <label>Your City</label>
              <input
                type="text"
                placeholder="City (e.g. Lahore)"
                value={newReview.location}
                onChange={e => setNewReview({ ...newReview, location: e.target.value })}
                required
              />
              <label>Rating</label>
              <div className="rating-select" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', fontSize: '1.5rem' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <i
                    key={star}
                    className={`${star <= newReview.rating ? 'fas' : 'far'} fa-star`}
                    style={{ cursor: 'pointer', color: '#FFD700' }}
                    onClick={() => setNewReview({ ...newReview, rating: star })}
                  ></i>
                ))}
              </div>
              <label>Comment</label>
              <textarea
                placeholder="Write your review here..."
                value={newReview.comment}
                onChange={e => setNewReview({ ...newReview, comment: e.target.value })}
                rows="4"
                required
              />
              <button type="submit" className="btn btn-primary mt-1" style={{ width: '100%' }}>Submit Review</button>
            </form>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      <div className={`cart-drawer-overlay ${isCartDrawerOpen ? 'active' : ''}`} onClick={() => setIsCartDrawerOpen(false)}></div>
      <div className={`cart-drawer ${isCartDrawerOpen ? 'open' : ''}`}>
        <div className="cart-drawer-header">
          <h2>Your Cart ({cart.length})</h2>
          <button className="btn-close-drawer" onClick={() => setIsCartDrawerOpen(false)}>&times;</button>
        </div>
        <div className="cart-drawer-items">
          {cart.length === 0 ? (
            <div className="empty-cart-state">
              <i className="fas fa-shopping-bag empty-cart-icon"></i>
              <p>Your cart is empty.</p>
              <button className="btn btn-primary mt-1" onClick={() => setIsCartDrawerOpen(false)}>Start Shopping</button>
            </div>
          ) : (() => {
            // Group items by product id + size
            const grouped = [];
            cart.forEach(item => {
              const key = `${item.id}_${item.size}`;
              const existing = grouped.find(g => g.key === key);
              if (existing) {
                existing.qty += 1;
                existing.ids.push(item.cartId);
              } else {
                grouped.push({ key, item, qty: 1, ids: [item.cartId] });
              }
            });
            return grouped.map(({ key, item, qty, ids }) => (
              <div key={key} className="cart-drawer-item">
                <img src={item.image} alt={item.name} />
                <div className="cart-drawer-item-info">
                  <h5>{item.name}</h5>
                  <p className="text-muted">Size: {item.size}</p>
                  <p className="item-price">Rs. {(item.price * qty).toLocaleString()}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={() => removeFromCart(ids[ids.length - 1])}
                      style={{ padding: '2px 10px', background: '#4A1A3E', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >−</button>
                    <span style={{ fontWeight: '700', minWidth: '20px', textAlign: 'center' }}>{qty}</span>
                    <button
                      onClick={() => {
                        const stockQty = item.stock && item.stock[String(item.size)] !== undefined ? parseInt(item.stock[String(item.size)]) : 999;
                        if (qty < stockQty) {
                          setCart(prev => [...prev, { ...item, cartId: Date.now() + Math.random() }]);
                        } else {
                          setToastMessage(`⚠️ Only ${stockQty} unit(s) available for Size ${item.size}.`);
                        }
                      }}
                      style={{ padding: '2px 10px', background: '#4A1A3E', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >+</button>
                  </div>
                </div>
                <button className="btn-remove-drawer" onClick={() => ids.forEach(id => removeFromCart(id))}>&times;</button>
              </div>
            ));
          })()}
        </div>
        {cart.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-total">
              <span>Subtotal</span>
              <span>Rs. {cart.reduce((a, b) => a + b.price, 0).toLocaleString()}</span>
            </div>
            <button className="btn btn-primary w-100" onClick={goToCart}>
              CHECKOUT
            </button>
          </div>
        )}
      </div>

      {/* Global Back Button (Internal Pages Only) */}
      {(infoPage || view !== 'store') && (
        <div className="back-navigation-container container">
          <button
            className="btn-minimal-back"
            onClick={() => {
              if (infoPage) setInfoPage(null);
              else if (view !== 'store') setView('store');
            }}
          >
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
      )}
      {/* Grand Opening Welcome Modal */}
      {showWelcomeModal && (
        <div className="welcome-modal-overlay" onClick={() => { setShowWelcomeModal(false); localStorage.setItem('zord_welcome_seen', '1'); }}>
          <div className="welcome-modal" onClick={e => e.stopPropagation()}>
            <button className="welcome-modal-close" onClick={() => { setShowWelcomeModal(false); localStorage.setItem('zord_welcome_seen', '1'); }}>&times;</button>
            <div className="welcome-modal-badge">🎉 GRAND OPENING</div>
            <h2 className="welcome-modal-title">Welcome to <span>ZORD</span> Pakistan!</h2>
            <p className="welcome-modal-subtitle">Step into excellence with our launch collection. Exclusive deals just for you!</p>
            <div className="welcome-modal-offer">
              <span className="offer-label">Special Launch Discount</span>
              <span className="offer-percent">20% OFF</span>
              <span className="offer-code">Use Code: <strong>ZORD20</strong></span>
            </div>
            <button className="btn btn-primary w-100" style={{ marginTop: '1.5rem', padding: '1rem', fontSize: '1rem' }} onClick={() => { setShowWelcomeModal(false); localStorage.setItem('zord_welcome_seen', '1'); }}>
              🛍️ Shop the Grand Opening
            </button>
            <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '1rem', textAlign: 'center' }}>Limited time offer. Tap anywhere outside to close.</p>
          </div>
        </div>
      )}

      {/* Scrolling Announcement Bar */}
      <div className="announcement-bar">
        <div className="announcement-track">
          🎉 GRAND OPENING SALE &nbsp;•&nbsp; 20% OFF All Products &nbsp;•&nbsp; Use Code: <strong>ZORD20</strong> &nbsp;•&nbsp; Free Delivery on Orders Above PKR 2000 &nbsp;•&nbsp; 🎉 GRAND OPENING SALE &nbsp;•&nbsp; 20% OFF All Products &nbsp;•&nbsp; Use Code: <strong>ZORD20</strong> &nbsp;•&nbsp; Free Delivery on Orders Above PKR 2000 &nbsp;•&nbsp;
        </div>
      </div>

      {/* Mobile Menu Close Overlay */}
      {isMobileMenuOpen && (
        <div
          onClick={(e) => { e.stopPropagation(); setIsMobileMenuOpen(false); }}
          style={{
            position: 'fixed', top: 0, left: 0,
            width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 2999,
            WebkitTapHighlightColor: 'transparent'
          }}
        />
      )}

      {/* Navigation */}
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
        <div className="container nav-container">
          <div className="logo" onClick={() => { setView('store'); setInfoPage(null); setIsMobileMenuOpen(false); }} style={{ cursor: 'pointer' }}>
            <img src="/images/logo.jpeg" alt="ZORD Logo" className="logo-img" />
            <span className="logo-text">ZORD</span>
          </div>

          {/* Navigation Links */}
          <ul className={`nav-links ${isMobileMenuOpen ? 'mobile-active' : ''}`}>
            {/* These show on BOTH but look different via CSS */}
            <li><a href="#shop" onClick={() => { setInfoPage(null); setIsMobileMenuOpen(false); }}>New Arrivals</a></li>

            {/* Desktop Dropdown - Hidden on Mobile via CSS or Logic */}
            <li
              className="nav-item-dropdown desktop-only"
              onMouseEnter={() => setShowDropdown(true)}
              onMouseLeave={() => setShowDropdown(false)}
            >
              <a href="#shop" className="dropdown-trigger">Collections <i className="fas fa-chevron-down"></i></a>
              {showDropdown && (
                <ul className="dropdown-menu animate-fade-in">
                  {(collections || []).map(c => (
                    <li key={c.id}>
                      <a href="#shop" onClick={() => { handleCategorySelect(c.name); setShowDropdown(false); setInfoPage(null); }}>
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            {/* Mobile Collections - Hidden on Desktop */}
            <li className="mobile-only">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                onClick={() => setIsMobileCollectionsOpen(!isMobileCollectionsOpen)}
              >
                <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#222' }}>Collections</span>
                <i className={`fas fa-chevron-${isMobileCollectionsOpen ? 'up' : 'down'}`} style={{ color: '#222', fontSize: '0.9rem' }}></i>
              </div>
              {isMobileCollectionsOpen && (
                <ul className="animate-fade-in" style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--color-primary-container)', marginLeft: '0.5rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                  {(collections || []).map(c => (
                    <li key={c.id} style={{ borderBottom: 'none' }}>
                      <a
                        href="#shop"
                        onClick={() => { handleCategorySelect(c.name); setIsMobileMenuOpen(false); setInfoPage(null); setIsMobileCollectionsOpen(false); }}
                        style={{ padding: '0.6rem 0', fontSize: '1.05rem', color: '#555', borderBottom: 'none' }}
                      >
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li><a href="#about" onClick={() => { setInfoPage(null); setIsMobileMenuOpen(false); }}>Our Story</a></li>
            <li><a href="#" onClick={(e) => { e.preventDefault(); setView('track-order'); setIsMobileMenuOpen(false); }}>Track Order</a></li>
            <li><a href="#info" onClick={() => { openInfo("Contact"); setIsMobileMenuOpen(false); }}>Contact</a></li>
            <li><button onClick={() => { setView('login'); setIsMobileMenuOpen(false); }} className="admin-link">Admin</button></li>
          </ul>

          <div className="nav-actions">
            <button className="icon-btn" onClick={() => setIsSearchOpen(true)}><i className="fas fa-search"></i></button>
            <button className="icon-btn" style={{ position: 'relative' }} title="Cart" onClick={() => setIsCartDrawerOpen(true)}>
              <i className="fas fa-shopping-bag"></i>
              {cart.length > 0 && <span className="cart-count">{cart.length}</span>}
            </button>
            <button
              className="icon-btn mobile-only menu-trigger-btn"
              onClick={(e) => { e.stopPropagation(); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              style={{ zIndex: 4001, position: 'relative' }}
            >
              <i className={isMobileMenuOpen ? "fas fa-times" : "fas fa-bars"}></i>
            </button>
          </div>
        </div>
      </nav>

      {/* Search Overlay */}
      {isSearchOpen && (
        <div className="search-overlay animate-fade-in">
          <div className="search-header">
            <div className="container">
              <div className="search-bar-container">
                <i className="fas fa-search search-icon-left"></i>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search products, collections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button className="btn-clear-search" onClick={() => setSearchQuery('')}>
                    <i className="fas fa-times"></i>
                  </button>
                )}
                <button className="btn-close-search" onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
          <div className="search-results-container container">
            {!searchQuery ? (
              <div className="smart-options-grid">
                <div className="smart-option-group">
                  <h4 className="search-group-title">Recent Searches</h4>
                  <ul className="search-list">
                    {recentSearches.map((s, i) => (
                      <li key={i} onClick={() => setSearchQuery(s)}>
                        <i className="fas fa-history text-muted"></i> <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="smart-option-group">
                  <h4 className="search-group-title">Popular Collections</h4>
                  <ul className="search-list">
                    {collections.slice(0, 4).map((col, i) => (
                      <li key={col.id} onClick={() => { setIsSearchOpen(false); handleCategorySelect(col.name); }}>
                        <i className={`fas fa-${i === 0 ? 'fire' : i === 1 ? 'star' : i === 2 ? 'bolt' : 'tag'} text-plum`}></i> <span>{col.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="search-results">
                {products.filter(p => (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()))).length > 0 ? (
                  <div className="auto-suggestions-grid">
                    {products.filter(p => (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()))).slice(0, 8).map(product => (
                      <div key={product.id} className="suggestion-item" onClick={() => {
                        setSelectedProduct(product);
                        setIsSearchOpen(false);
                        if (!recentSearches.includes(searchQuery)) {
                          setRecentSearches([searchQuery, ...recentSearches].slice(0, 3));
                        }
                      }}>
                        <img src={product.image} alt={product.name} />
                        <div className="suggestion-info">
                          <h5>{product.name}</h5>
                          <p className="text-muted">{product.category}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state text-center py-section">
                    <i className="fas fa-search-minus empty-icon text-muted" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
                    <h3>No shoes found for "{searchQuery}"</h3>
                    <p className="text-muted mt-1">Try a different spelling or browse our New Arrivals instead!</p>
                    <button className="btn btn-primary mt-2" onClick={() => { setIsSearchOpen(false); setSearchQuery(''); handleCategorySelect(null); }}>Browse Full Collection</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero Carousel */}
      <section className="hero-carousel">
        {(slides || []).map((slide, index) => (
          <div key={index} className={`slide ${index === activeSlide ? 'active' : ''}`}>
            <div className="slide-overlay"></div>
            <img src={slide.image} alt={slide.title} className="slide-bg" onError={handleImageError} />
            <div className="container slide-content">
              <h1 className="slide-title">
                {slide.title.split(' ').map((word, i, arr) => (
                  <React.Fragment key={i}>
                    {i === Math.floor(arr.length / 2) ? <span className="text-plum">{word}</span> : word}
                    {i < arr.length - 1 ? ' ' : ''}
                  </React.Fragment>
                ))}
              </h1>
              <p className="slide-subtitle">{slide.subtitle}</p>
              <div className="slide-btns">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {slide.cta || 'Discover More'}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Navigation Arrows */}
        <button
          className="carousel-arrow left"
          onClick={() => setActiveSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1))}
        >
          <i className="fas fa-chevron-left"></i>
        </button>
        <button
          className="carousel-arrow right"
          onClick={() => setActiveSlide((prev) => (prev + 1) % slides.length)}
        >
          <i className="fas fa-chevron-right"></i>
        </button>

        <div className="carousel-indicators">
          {slides.map((_, index) => (
            <div
              key={index}
              className={`indicator ${index === activeSlide ? 'active' : ''}`}
              onClick={() => setActiveSlide(index)}
            >
              <div className="indicator-progress"></div>
            </div>
          ))}
        </div>
      </section>

      {/* New Arrivals */}
      <section id="new-arrivals" className="py-section new-arrivals-section">
        <div className="container">
          <div className="new-arrivals-header">
            <div className="na-badge"><span className="na-badge-dot"></span>New Drop</div>
            <h2 className="na-title">New Arrivals</h2>
            <p className="na-subtitle">The freshest kicks just landed — before they're gone.</p>
          </div>
          <div className="products-grid">
            {products.filter(p => p.isNewArrival).reverse().map((product) => (
              <div key={product.id} className="na-card" onClick={() => setSelectedProduct(product)}>
                <div className={`na-image-wrap ${product.hoverImage ? 'has-hover' : ''}`}>
                  {calculateDiscount(product.price, product.originalPrice) ? (
                    <span className="na-discount-badge">-{calculateDiscount(product.price, product.originalPrice)}%</span>
                  ) : null}
                  <span className="na-new-pill">NEW</span>
                  <img src={product.image} alt={product.name} className="na-primary-img" loading="lazy" onError={handleImageError} />
                  {product.hoverImage && <img src={product.hoverImage} alt={product.name} className="na-hover-img" loading="lazy" onError={handleImageError} />}
                  {product.saleEndDate && <CountdownTimer endDate={product.saleEndDate} />}
                </div>
                <div className="na-info">
                  <p className="na-category">{product.category}</p>
                  <h3 className="na-name">{product.name}</h3>
                  <div className="na-price-row">
                    <span className="na-price">Rs. {product.price.toLocaleString()}</span>
                    {product.originalPrice > product.price && (
                      <span className="na-original-price">Rs. {product.originalPrice.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Collections */}
      <section id="collections" className="py-section bg-white">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">The Collections</h2>
            <p className="section-subtitle">Curated for performance, styled for life.</p>
          </div>
          <div className="collections-grid">
            {(collections || []).map((col) => (
              <div key={col.id} className="collection-card" onClick={() => handleCategorySelect(col.name)}>
                <img src={col.image || "/images/hero_clean.png"} alt={col.name} loading="lazy" />
                <div className="collection-info">
                  <p className="subtitle">Discover</p>
                  <h3>{col.name}</h3>
                  <a href="#shop" className="btn btn-secondary">Explore Collection</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Dynamic Products Grid */}
      <section id="shop" className="py-section bg-white">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">{filterCategory ? `${filterCategory} Collection` : 'Full Collection'}</h2>
            <p className="section-subtitle">Browse our premium lineup of footwear.</p>
            {filterCategory && <button className="btn btn-secondary mt-1" onClick={() => handleCategorySelect(null)}>View All Collections</button>}
          </div>

          <ProductFilters
            products={products}
            currentFilters={advancedFilters}
            onFilterChange={(newFilters) => {
              setAdvancedFilters(newFilters);
              setFilterCategory(null);
              setVisibleProducts(8); // Reset pagination on filter change
            }}
          />

          <div style={{ fontSize: '12px', color: '#666', marginBottom: '1rem' }}>
            Showing {filteredProducts.length} of {products.length} products
          </div>

          <div className="products-grid">
            {filteredProducts.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 0' }}>
                <h3>No products found for these filters</h3>
                <button
                  className="btn btn-secondary mt-1"
                  onClick={() => {
                    setAdvancedFilters({ search: '', category: '', size: '', minPrice: 0, maxPrice: 50000, color: '' });
                    setFilterCategory(null);
                  }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              filteredProducts.slice(0, visibleProducts).map((product) => (
                <div key={product.id} className="na-card" onClick={() => setSelectedProduct(product)}>
                  <div className={`na-image-wrap ${product.hoverImage ? 'has-hover' : ''}`}>
                    {calculateDiscount(product.price, product.originalPrice) ? (
                      <span className="na-discount-badge">-{calculateDiscount(product.price, product.originalPrice)}%</span>
                    ) : null}
                    {product.isNewArrival && <span className="na-new-pill">NEW</span>}
                    <img src={product.image} alt={product.name} className="na-primary-img" loading="lazy" onError={handleImageError} />
                    {product.hoverImage && <img src={product.hoverImage} alt={product.name} className="na-hover-img" loading="lazy" onError={handleImageError} />}
                    {product.saleEndDate && <CountdownTimer endDate={product.saleEndDate} />}
                  </div>
                  <div className="na-info">
                    <p className="na-category">{product.category}</p>
                    <h3 className="na-name">{product.name}</h3>
                    <div className="na-price-row">
                      <span className="na-price">Rs. {product.price.toLocaleString()}</span>
                      {product.originalPrice > product.price && (
                        <span className="na-original-price">Rs. {product.originalPrice.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {visibleProducts < filteredProducts.length && (
            <div style={{ textAlign: 'center', marginTop: '3rem' }}>
              <button className="btn btn-primary" onClick={() => setVisibleProducts(prev => prev + 8)}>
                View More Products
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Brand Story */}
      <section id="about" className="py-section brand-story bg-gray">
        <div className="container story-grid">
          <div className="story-image">
            <img src="/images/zord_hands_sneaker.jpeg" alt="Everyone Wants ZORD" className="main-story-img" loading="lazy" />
            <div className="story-logo-overlay">
              <img src="/images/logo.jpeg" alt="ZORD Logo" />
            </div>
          </div>
          <div className="story-content">
            <h2 className="section-title">Beyond the <span className="text-plum">Ordinary</span></h2>
            <p className="story-text">{siteContent.about}</p>
            <button className="btn btn-secondary">Read Our Mission</button>
          </div>
        </div>
      </section>

      {/* Customer Reviews Section */}
      <section id="reviews" className="py-section reviews-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">What Our <span className="text-plum">Customers</span> Say</h2>
            <p className="section-subtitle">Real feedback from real ZORD fans.</p>
            <button className="btn btn-primary mt-1" onClick={() => setIsReviewModalOpen(true)}>Write a Review</button>
          </div>
          <div className="reviews-grid">
            {(reviews || []).map((review) => (
              <div key={review.id} className="review-card">
                <div className="review-stars">
                  {[...Array(review.rating)].map((_, i) => (
                    <i key={i} className="fas fa-star"></i>
                  ))}
                </div>
                <p className="review-comment">"{review.comment}"</p>
                <div className="review-author">
                  <div className="author-avatar">
                    {review.name.charAt(0)}
                  </div>
                  <div className="author-info">
                    <h4>{review.name}</h4>
                    <p>{review.location} • {review.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer" id="site-footer">
        <div className="container">
          <div className="footer-grid-detailed">

            {/* --- Shop Column --- */}
            <div className="footer-col">
              <h4>Shop</h4>
              <ul>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Sneaker Fest'); }}>Sneaker Fest</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Men'); }}>Men</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Women'); }}>Women</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Kids'); }}>Kids</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Bags'); }}>Bags</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Accessories'); }}>Accessories</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Super Sale'); }}>Super Sale</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('ZORD Club'); }}>ZORD Club</a></li>
              </ul>
            </div>

            {/* --- Help Center Column --- */}
            <div className="footer-col">
              <h4>Help Center</h4>
              <ul>
                <li><a href="#" onClick={(e) => { e.preventDefault(); setView('track-order'); }}>Track My Order</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Write To Us', 'Write to Us'); }}>Write to Us</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Contact info', 'Contact Info'); }}>Contact Info</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Store Locator'); }}>Store Locator</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Shipping', 'Shipping Policy'); }}>Shipping Policy</a></li>
              </ul>
            </div>

            {/* --- Business Column --- */}
            <div className="footer-col">
              <h4>Business</h4>
              <ul>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('About Us'); }}>About Us</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Export Collection'); }}>Export Collection</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Franchise Program'); }}>Franchise Program</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Sneaker Fest'); }}>Sneaker Fest</a></li>
              </ul>
            </div>

            {/* --- Customer Care Column --- */}
            <div className="footer-col">
              <h4>Customer Care</h4>
              <ul>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Privacy Policy'); }}>Privacy Policy</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Refund policy', 'Refund Policy'); }}>Return & Refund Policy</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Terms of Service'); }}>Terms of Service</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Terms and Conditions', 'Terms & Conditions'); }}>Terms & Conditions</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo("FAQ's", 'FAQs'); }}>FAQs</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); openInfo('Payment Options'); }}>Payment Options</a></li>
              </ul>
            </div>

            {/* --- Connect Column --- */}
            <div className="footer-col">
              <h4>Follow Us</h4>
              <div className="social-links-grid">
                <a href="https://www.instagram.com/zord.pakistan?igsh=MXEzZWhxYjcwcG51bA==" target="_blank" rel="noopener noreferrer" title="Instagram">
                  <i className="fab fa-instagram"></i>
                </a>
                <a href="https://www.tiktok.com/@zord_0fficial?_r=1&_t=ZS-95cs0pI1KKq" target="_blank" rel="noopener noreferrer" title="TikTok">
                  <i className="fab fa-tiktok"></i>
                </a>
                <a href="https://wa.me/923061412735" target="_blank" rel="noopener noreferrer" title="WhatsApp">
                  <i className="fab fa-whatsapp"></i>
                </a>
              </div>

              <h4 className="mt-2">Contact Us</h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <li style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="far fa-clock" style={{ color: '#fbbc05' }}></i> Operational Hours: Mon to Sat (9:00 AM - 6:00 PM)
                </li>
                <li>
                  <a href="https://wa.me/923061412735" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <i className="fab fa-whatsapp" style={{ color: '#25D366' }}></i> 03061412735
                  </a>
                </li>
                <li>
                  <a href="mailto:zordofficialpk@gmail.com" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <i className="fas fa-envelope" style={{ color: '#d93025' }}></i> zordofficialpk@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Post+Office+Chak+No+255+JB+Chak+No+250+JB+Tehsil+District+Jhang+Pakistan"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textDecoration: 'none' }}
                    title="Open in Google Maps"
                  >
                    <i className="fas fa-map-marker-alt" style={{ color: '#ea4335', marginTop: '0.2rem', flexShrink: 0 }}></i>
                    <span>
                      <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Official Address:</strong><br />
                      Post Office Chak No. 255 J.B, Chak No. 250 J.B,<br />
                      Tehsil &amp; District Jhang.
                    </span>
                  </a>
                </li>
              </ul>

              <h4 className="mt-2">We Accept</h4>
              <div className="payment-icons-grid">
                <i className="fab fa-cc-visa"></i>
                <i className="fab fa-cc-mastercard"></i>
                <i className="fab fa-cc-apple-pay"></i>
              </div>
            </div>

          </div>
          <div className="footer-bottom-detailed">
            <p>&copy; 2026 Zord Pakistan. All rights reserved. | <a href="#" onClick={(e) => { e.preventDefault(); openInfo('Privacy Policy'); }} style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</a> | <a href="#" onClick={(e) => { e.preventDefault(); openInfo('Terms of Service'); }} style={{ color: 'rgba(255,255,255,0.5)' }}>Terms of Service</a></p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

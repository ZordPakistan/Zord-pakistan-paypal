// Initial dummy data for ZORD Footwear
export const INITIAL_PRODUCTS = [
  {
    id: 1,
    name: "ZORD Kinetic Aether-1",
    category: "Running",
    price: 129.00,
    originalPrice: 160.00,
    image: "/images/hero_clean.png",
    images: ["/images/hero_clean.png", "/images/urban_streetwear.png", "/images/mens_sport.png"],
    rating: 4.9,
    description: "Aerospace-grade cushioning for maximum athletic efficiency.",
    availableSizes: ["39", "40", "41", "42", "45"],
    isNewArrival: true,
    saleEndDate: new Date(Date.now() + 86400000 * 2).toISOString() // 2 days from now
  },
  {
    id: 2,
    name: "ZORD Urban Flow",
    category: "Streetwear",
    price: 149.00,
    image: "/images/urban_streetwear.png",
    images: ["/images/urban_streetwear.png", "/images/hero_clean.png"],
    rating: 4.8,
    description: "Minimalist design crafted for the modern city life.",
    availableSizes: ["40", "41", "42", "43", "44"],
    isNewArrival: true
  },
  {
    id: 3,
    name: "ZORD Pro Sport",
    category: "Sport",
    price: 110.00,
    originalPrice: 140.00,
    image: "/images/mens_sport.png",
    rating: 4.7,
    description: "High-performance materials for elite athletes.",
    availableSizes: ["39", "42", "43", "44"],
    isNewArrival: true,
    saleEndDate: new Date(Date.now() + 86400000 * 1.5).toISOString() // 1.5 days from now
  }
];

export const INITIAL_SLIDES = [
  {
    id: 1,
    title: "Engineered for Excellence",
    subtitle: "The all-new ZORD Kinetic Series. Redefining what's possible.",
    image: "/images/hero_clean.png",
    cta: "Discover More"
  },
  {
    id: 2,
    title: "Urban Sophistication",
    subtitle: "Style meets substance. Premium materials for the modern city.",
    image: "/images/urban_streetwear.png",
    cta: "View Collection"
  }
];

export const CATEGORIES = ["Running", "Streetwear", "Sport"];

export const INITIAL_REVIEWS = [
  {
    id: 1,
    name: "Ahmad Khan",
    location: "Lahore",
    rating: 5,
    comment: "The quality is outstanding. Most comfortable shoes I've ever owned. Delivery was also very fast!",
    date: "2 days ago"
  },
  {
    id: 2,
    name: "Sara Ali",
    location: "Karachi",
    rating: 5,
    comment: "Absolutely love the design. It's so minimalist and goes with everything. Highly recommend!",
    date: "1 week ago"
  },
  {
    id: 3,
    name: "Usman Sheikh",
    location: "Islamabad",
    rating: 4,
    comment: "Great experience. The sizing is perfect and the materials feel premium. Will buy again.",
    date: "2 weeks ago"
  }
];

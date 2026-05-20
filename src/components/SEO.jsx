import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, image, url }) => {
  const defaultTitle = "ZORD Footwear | Step into Excellence";
  const defaultDescription = "Premium footwear brand in Pakistan. Experience the fusion of athletic performance and urban elegance.";
  const defaultImage = "https://zordpakistan.shop/assets/logo.jpeg"; // Assuming a default logo
  const siteUrl = "https://zordpakistan.shop";

  const seoTitle = title ? `${title} | ZORD Footwear` : defaultTitle;
  const seoDescription = description || defaultDescription;
  const seoImage = image || defaultImage;
  const canonicalUrl = url ? `${siteUrl}${url}` : siteUrl;

  return (
    <Helmet>
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />
      <meta name="keywords" content="shoes Pakistan, footwear Pakistan, online shoes, ZORD footwear" />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:image" content={seoImage} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seoTitle} />
      <meta name="twitter:description" content={seoDescription} />
      <meta name="twitter:image" content={seoImage} />
    </Helmet>
  );
};

export default SEO;

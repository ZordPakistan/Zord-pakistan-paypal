import React, { useState } from 'react';
import { db } from '../firebase';
import { ref, set } from 'firebase/database';

const CustomerReviews = ({ productId, reviews }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newReview, setNewReview] = useState({ name: '', rating: 5, comment: '' });

  const productReviews = reviews.filter(r => r.productId === productId);
  const avgRating = productReviews.length 
    ? (productReviews.reduce((sum, r) => sum + Number(r.rating), 0) / productReviews.length).toFixed(1) 
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    const reviewId = `REV-${Date.now()}`;
    const reviewData = {
      ...newReview,
      id: reviewId,
      productId,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    set(ref(db, `reviews/${reviewId}`), reviewData);
    setNewReview({ name: '', rating: 5, comment: '' });
    setIsFormOpen(false);
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <span key={i} style={{ color: i < rating ? '#FFD700' : '#ddd', fontSize: '1.2rem' }}>★</span>
    ));
  };

  return (
    <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Customer Reviews</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{avgRating}</span>
            <span style={{ marginLeft: '5px', display: 'flex' }}>{renderStars(Math.round(avgRating))}</span>
            <span style={{ marginLeft: '5px', color: '#666' }}>({productReviews.length})</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsFormOpen(!isFormOpen)}>
            {isFormOpen ? 'Cancel' : 'Write a Review'}
          </button>
        </div>
      </div>

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="animate-fade-in" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Name</label>
            <input type="text" required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newReview.name} onChange={e => setNewReview({...newReview, name: e.target.value})} placeholder="Your Name" />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Rating</label>
            <select style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newReview.rating} onChange={e => setNewReview({...newReview, rating: Number(e.target.value)})}>
              {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Stars</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Comment</label>
            <textarea required rows="4" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }} value={newReview.comment} onChange={e => setNewReview({...newReview, comment: e.target.value})} placeholder="Share your experience..."></textarea>
          </div>
          <button type="submit" className="btn btn-primary">Submit Review</button>
        </form>
      )}

      <div>
        {productReviews.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px', textAlign: 'center' }}>No reviews yet. Be the first to review this product!</p>
        ) : (
          productReviews.map(review => (
            <div key={review.id} style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <strong style={{ fontSize: '1.1rem' }}>{review.name}</strong>
                <span style={{ color: '#888', fontSize: '0.9rem' }}>{review.date}</span>
              </div>
              <div style={{ marginBottom: '10px', display: 'flex' }}>{renderStars(review.rating)}</div>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{review.comment}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CustomerReviews;

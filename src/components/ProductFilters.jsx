import React, { useState } from 'react';

const ProductFilters = ({ products, onFilterChange, currentFilters }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState(currentFilters);
  
  React.useEffect(() => {
    setFilters(currentFilters);
  }, [currentFilters]);

  const categories = [...new Set(['Men', 'Women', 'Kids', ...products.map(p => p.category).filter(Boolean)])];
  const colors = [...new Set(products.map(p => p.color).filter(Boolean))];

  const handleFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onFilterChange(filters);
    setIsOpen(false);
  };

  const activeCount = [
    filters.search !== '',
    filters.category !== '',
    filters.size !== '',
    filters.maxPrice !== 50000,
    filters.color !== ''
  ].filter(Boolean).length;

  return (
    <div style={{ marginBottom: '20px' }}>
      <button 
        className="btn btn-secondary d-md-none" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '15px', borderRadius: '8px', border: '1px solid #eee' }}
      >
        <span><i className="fas fa-filter"></i> Filters</span>
        {activeCount > 0 && <span style={{ background: '#4A1A3E', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '12px' }}>{activeCount}</span>}
      </button>

      <div className={`filter-panel ${isOpen ? 'open' : ''}`} style={{ display: isOpen ? 'block' : 'none', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #eee' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Search by Name</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Ex: Kinetic, Aether..." 
                style={{ width: '100%', padding: '10px 10px 10px 35px', borderRadius: '4px', border: '1px solid #ccc' }} 
                value={filters.search || ''} 
                onChange={e => handleFilter('search', e.target.value)} 
                onKeyPress={e => e.key === 'Enter' && handleApply()}
              />
              <i className="fas fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: '0.9rem' }}></i>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Category</label>
            <select style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={filters.category} onChange={e => handleFilter('category', e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Size (EU)</label>
            <select style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={filters.size} onChange={e => handleFilter('size', e.target.value)}>
              <option value="">All Sizes</option>
              {Array.from({length: 14}, (_, i) => 35 + i).map(s => <option key={s} value={s.toString()}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Price: Rs. {filters.minPrice} - Rs. {filters.maxPrice}</label>
            <input 
              type="range" 
              min="0" max="50000" step="500" 
              value={filters.maxPrice} 
              onChange={e => handleFilter('maxPrice', Number(e.target.value))}
              style={{ width: '100%', accentColor: '#4A1A3E' }}
            />
          </div>

          {colors.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Color</label>
              <select style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={filters.color} onChange={e => handleFilter('color', e.target.value)}>
                <option value="">All Colors</option>
                {colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          
        </div>
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => {
            const reset = { search: '', category: '', size: '', minPrice: 0, maxPrice: 50000, color: '' };
            setFilters(reset);
            onFilterChange(reset);
            setIsOpen(false);
          }}>Clear Filters</button>
          <button className="btn btn-primary btn-sm" onClick={handleApply}>
            <i className="fas fa-search"></i> Search Products
          </button>
        </div>
      </div>
      
      <style>{`
        @media (min-width: 768px) {
          .d-md-none { display: none !important; }
          .filter-panel { display: block !important; margin-bottom: 30px; }
        }
        @media (max-width: 767px) {
          .filter-panel.open {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 10000;
            border-radius: 20px 20px 0 0;
            padding-bottom: 40px;
            animation: slideUp 0.3s ease-out forwards;
          }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ProductFilters;

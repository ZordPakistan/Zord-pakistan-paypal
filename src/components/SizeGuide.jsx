import React from 'react';

const SizeGuide = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="card-styled animate-scale-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '90%', width: '500px', padding: '20px', backgroundColor: 'white', borderRadius: '8px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Size Guide</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f3f3' }}>
              <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>EU Size</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>UK Size</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Pakistan</th>
              <th style={{ padding: '10px', borderBottom: '2px solid #ddd' }}>Length (cm)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { eu: 36, uk: 3.5, pk: 4, cm: 22.5 },
              { eu: 37, uk: 4, pk: 5, cm: 23.5 },
              { eu: 38, uk: 5, pk: 6, cm: 24.5 },
              { eu: 39, uk: 6, pk: 7, cm: 25.0 },
              { eu: 40, uk: 6.5, pk: 7.5, cm: 25.5 },
              { eu: 41, uk: 7.5, pk: 8.5, cm: 26.5 },
              { eu: 42, uk: 8, pk: 9, cm: 27.0 },
              { eu: 43, uk: 9, pk: 10, cm: 28.0 },
              { eu: 44, uk: 9.5, pk: 10.5, cm: 28.5 },
              { eu: 45, uk: 10.5, pk: 11.5, cm: 29.5 },
              { eu: 46, uk: 11, pk: 12, cm: 30.0 }
            ].map((row, idx) => (
              <tr key={row.eu} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}><strong>{row.eu}</strong></td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{row.uk}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{row.pk}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>{row.cm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SizeGuide;

import GoogleApiWrapper from './Map';
import React from 'react';

const Locations = () => {
  return (
    <div
      id='Location'
      style={{
        backgroundColor: '#ebebeb',
        paddingTop: '30px',
        paddingBottom: '60px',
      }}
    >
      <div
        style={{
          backgroundColor: '#002B5C',
          color: '#FFFFFF',
          textAlign: 'center',
          padding: '20px',
          paddingBottom: '30px',
          borderRadius: '12px',
          margin: '20px auto',
          maxWidth: '700px',
          boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <p style={{ fontSize: '1.4rem', margin: 0 }}>
          Explore Moonlighting Opportunities Across the Country
        </p>
      </div>

      {/* Map Section */}
      <div
        style={{
          margin: '0 auto',
          padding: '20px',
          boxSizing: 'border-box',
        }}
        className='map-container'
      >
        <GoogleApiWrapper />
      </div>
    </div>
  );
};

export default Locations;

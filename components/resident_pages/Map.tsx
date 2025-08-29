import React, { useState } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';
import 'dotenv/config';

interface StateInfo {
  name: string;
  position: { lat: number; lng: number };
}


const MapWithLocations: React.FC = () => {
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -95.665 }); // Center of the US
  const [mapZoom, setMapZoom] = useState(4); // Default zoom to show all states

  const containerStyle = {
    width: '100%',
    height: '400px',
    borderRadius: '10px',
    overflow: 'hidden',
  };

  const locations = [
    { name: 'Connecticut', position: { lat: 41.6032, lng: -73.0877 } },
    { name: 'Louisiana', position: { lat: 31.9686, lng: -91.9623 } },
    { name: 'South Carolina', position: { lat: 33.8361, lng: -81.1637 } },
    { name: 'Arizona', position: { lat: 34.0489, lng: -111.0937 } },
    { name: 'Florida', position: { lat: 27.9944, lng: -81.7603 } },
    { name: 'Nevada', position: { lat: 38.8026, lng: -116.4194 } },
    { name: 'California', position: { lat: 36.7783, lng: -119.4179 } },
    { name: 'Arkansas', position: { lat: 34.9697, lng: -92.3731 } },
    { name: 'Tennessee', position: { lat: 35.5175, lng: -86.5804 } },
    { name: 'North Carolina', position: { lat: 35.7596, lng: -79.0193 } },
    { name: 'Texas', position: { lat: 31.9686, lng: -99.9018 } },
    { name: 'Illinois', position: { lat: 40.6331, lng: -89.3985 } },
    { name: 'New York', position: { lat: 43.2994, lng: -74.2179 } },
  ];

  const handleLocationClick = (location: StateInfo) => {
    setMapCenter(location.position); // Center the map on the clicked location
    setMapZoom(6); // Zoom in on the clicked location
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        backgroundColor: '#f9f9f9',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        maxWidth: '900px',
        margin: '20px auto',
      }}
    >
      {/* Map Section */}
      <div style={{ flex: '1 1 60%', margin: '10px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
          DOCMOONLIGHT
        </div>
        <LoadScript googleMapsApiKey={process.env.Key ?? ''}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={mapZoom}
          >
            {locations.map((location, index) => (
              <Marker
                key={index}
                position={location.position}
                title={location.name}
              />
            ))}
          </GoogleMap>
        </LoadScript>
      </div>

      {/* Locations Section */}
      <div
        style={{
          flex: '1 1 35%',
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '10px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3
          style={{
            textAlign: 'center',
            color: '#002B5C',
            marginBottom: '15px',
          }}
        >
          Available Locations
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
          }}
        >
          {locations.map((location, index) => (
            <div
              key={index}
              style={{
                fontSize: '14px',
                padding: '5px',
                borderBottom: '1px solid #ddd',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: '#f9f9f9',
                borderRadius: '5px',
                transition: 'background-color 0.3s',
              }}
              onClick={() => handleLocationClick(location)}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#e0e0e0')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#f9f9f9')
              }
            >
              {location.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MapWithLocations;

import { useState, useEffect } from 'react';
import './Login.css';

function Login({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:9000';
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      
      console.log('Attempting auth:', endpoint, 'to', backendUrl);
      
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      
      console.log('Auth response:', response.status, data);

      if (response.ok) {
        console.log('Auth successful, user data:', data);
        // Call parent callback with user data
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        console.error('Auth failed:', data.error);
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>P2P Video Chat</h1>
        <p className="subtitle">Connect with anyone, anywhere</p>
        
        <div className="features">
          <div className="feature">
            <span className="icon">🎥</span>
            <span>HD Video Calls</span>
          </div>
          <div className="feature">
            <span className="icon">💬</span>
            <span>Real-time Chat</span>
          </div>
          <div className="feature">
            <span className="icon">🔒</span>
            <span>Secure P2P</span>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => setIsLogin(true)}
            style={{
              padding: '10px 20px',
              background: isLogin ? '#4CAF50' : 'transparent',
              color: 'white',
              border: '1px solid #4CAF50',
              borderRadius: '4px 0 0 4px',
              cursor: 'pointer',
              width: '50%'
            }}
          >
            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            style={{
              padding: '10px 20px',
              background: !isLogin ? '#4CAF50' : 'transparent',
              color: 'white',
              border: '1px solid #4CAF50',
              borderRadius: '0 4px 4px 0',
              cursor: 'pointer',
              width: '50%'
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          <input
            type="text"
            name="username"
            placeholder="Username (unique)"
            value={formData.username}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              borderRadius: '4px',
              border: '1px solid #444',
              background: '#2a2a2a',
              color: 'white',
              fontSize: '14px'
            }}
          />
          
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '10px',
              borderRadius: '4px',
              border: '1px solid #444',
              background: '#2a2a2a',
              color: 'white',
              fontSize: '14px'
            }}
          />

          {error && (
            <div style={{
              padding: '10px',
              marginBottom: '10px',
              background: '#ff4444',
              color: 'white',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <p className="privacy-note">
          Your username will be visible during video chats
        </p>
      </div>
    </div>
  );
}

export default Login;

import { useState } from 'react';
import './InterestsSetup.css';

function InterestsSetup({ user, onComplete }) {
  const [interests, setInterests] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Popular tech interests suggestions
  const suggestions = [
    'JavaScript', 'Python', 'React', 'Node.js', 'TypeScript',
    'Vue.js', 'Angular', 'MongoDB', 'PostgreSQL', 'Docker',
    'Kubernetes', 'AWS', 'Machine Learning', 'AI', 'Blockchain',
    'Web3', 'Flutter', 'React Native', 'Go', 'Rust',
    'Java', 'C++', 'Swift', 'Kotlin', 'PHP',
    'Ruby', 'Django', 'Flask', 'Express', 'Next.js',
    'GraphQL', 'REST API', 'DevOps', 'CI/CD', 'Git'
  ];

  const addInterest = (interest) => {
    const trimmed = interest.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests([...interests, trimmed]);
      setInputValue('');
    }
  };

  const removeInterest = (interest) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const handleSubmit = async () => {
    if (interests.length === 0) {
      alert('Please add at least one interest');
      return;
    }

    setLoading(true);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:9000';
      const response = await fetch(`${backendUrl}/api/user/interests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ interests })
      });

      const data = await response.json();

      if (data.success) {
        onComplete(data.user);
      } else {
        alert('Failed to save interests');
      }
    } catch (error) {
      console.error('Error saving interests:', error);
      alert('Failed to save interests');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="interests-container">
      <div className="interests-box">
        
        <div className="profile-header">
          <img src={user.avatar} alt="avatar" className="profile-avatar" />
          <h2>Welcome, {user.name}!</h2>
          <p className="subtitle">Tell us about your tech interests</p>
        </div>

        <div className="interests-content">
          
          <div className="input-section">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  addInterest(inputValue);
                }
              }}
              placeholder="Type a technology or framework..."
              className="interest-input"
            />
            <button 
              onClick={() => addInterest(inputValue)}
              className="add-btn"
              disabled={!inputValue.trim()}
            >
              Add
            </button>
          </div>

          {interests.length > 0 && (
            <div className="selected-interests">
              <h3>Your Interests ({interests.length})</h3>
              <div className="interests-grid">
                {interests.map((interest, index) => (
                  <div key={index} className="interest-tag selected">
                    <span>{interest}</span>
                    <button 
                      onClick={() => removeInterest(interest)}
                      className="remove-btn"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="suggestions-section">
            <h3>Popular Technologies</h3>
            <div className="interests-grid">
              {suggestions
                .filter(s => !interests.includes(s))
                .slice(0, 15)
                .map((suggestion, index) => (
                  <div 
                    key={index} 
                    className="interest-tag suggestion"
                    onClick={() => addInterest(suggestion)}
                  >
                    <span>{suggestion}</span>
                    <span className="add-icon">+</span>
                  </div>
                ))}
            </div>
          </div>

        </div>

        <button 
          onClick={handleSubmit}
          className="continue-btn"
          disabled={loading || interests.length === 0}
        >
          {loading ? 'Saving...' : `Continue with ${interests.length} interest${interests.length !== 1 ? 's' : ''}`}
        </button>

      </div>
    </div>
  );
}

export default InterestsSetup;

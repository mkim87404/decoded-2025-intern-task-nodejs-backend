// App.js
import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [description, setDescription] = useState('');
  const [output, setOutput] = useState(null);

  const handleSubmit = async () => {
    const res = await axios.post('https://your-backend-url.onrender.com/extract', { description });
    setOutput(res.data);
  };

  return (
    <div>
      <h1>Mini App Builder</h1>
      <textarea onChange={e => setDescription(e.target.value)} />
      <button onClick={handleSubmit}>Submit</button>
      {output && <pre>{JSON.stringify(output, null, 2)}</pre>}
    </div>
  );
}

export default App;
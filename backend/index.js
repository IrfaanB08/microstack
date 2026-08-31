const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ message: 'Microstack API is running', status: 'healthy' });
});

// Placeholder for future routes
// app.use('/api/auth', require('./src/routes/auth'));
// app.use('/api/users', require('./src/routes/users'));
// app.use('/api/meal-plans', require('./src/routes/mealPlans'));

app.listen(PORT, () => {
  console.log(`Microstack backend running on port ${PORT}`);
});

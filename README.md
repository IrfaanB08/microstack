# Microstack

A meal-prep and macro-tracking web application for gym-goers. Microstack generates weekly meal plans aligned to user goals (bulk/cut/maintain/recomp), produces auto-generated shopping lists, and tracks macros.

## Project Structure

```
Microstack-Project/
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Auth & other middleware
│   │   ├── models/         # Database models
│   │   └── routes/         # API route definitions
│   ├── index.js            # Application entry point
│   ├── package.json        # Backend dependencies
│   └── .env.example        # Environment variables template
├── frontend/               # React frontend (mobile-first)
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   ├── context/        # React context providers
│   │   ├── services/       # API service layer
│   │   ├── App.jsx         # Main application component
│   │   ├── App.css         # App styles with dark mode
│   │   └── main.jsx        # React entry point
│   ├── vite.config.js      # Vite configuration
│   └── package.json        # Frontend dependencies
├── database/               # PostgreSQL schema & migrations
│   ├── SCHEMA_RELATIONSHIPS.md  # Database relationship documentation
│   └── migrations/         # Database migration files (managed by node-pg-migrate)
└── README.md              # This file
```

## Tech Stack

### Backend
- **Node.js** with **Express** - REST API server
- **PostgreSQL** - Relational database
- **node-pg-migrate** - Database migration management
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment variable management

### Frontend
- **React** - UI framework
- **Vite** - Build tool and dev server
- **Mobile-first responsive design** - Optimized for mobile devices
- **System-preference dark mode** - Automatically switches based on user's OS/browser theme

### Database
- **PostgreSQL** with UUID primary keys
- Comprehensive schema for users, macros, meal plans, meals, and shopping lists
- Automated timestamp triggers for updated_at fields

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE microstack;
```

2. Run database migrations:
```bash
cd backend
npm run migrate
```

The migration system uses `node-pg-migrate` to manage schema evolution. See `database/SCHEMA_RELATIONSHIPS.md` for detailed schema documentation.

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your `.env` file with your database credentials:
```
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/microstack
JWT_SECRET=your_jwt_secret_here
NODE_ENV=development
```

5. Start the backend server:
```bash
npm start
```

The API will be available at `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Endpoints

### Current Endpoints
- `GET /api/health` - Health check endpoint

### Planned Endpoints (to be implemented)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `POST /api/users/macros` - Set user macro targets
- `GET /api/meal-plans/weekly` - Get weekly meal plan
- `POST /api/meal-plans/generate` - Generate new meal plan
- `GET /api/shopping/list` - Get shopping list
- `POST /api/shopping/items` - Add shopping list item

## Features

### Currently Implemented
- ✅ Project structure with clean separation of concerns
- ✅ Express backend with CORS and middleware structure
- ✅ PostgreSQL database with comprehensive schema and migration system
- ✅ Database models for Users, Recipes, MealPlans, PlannedMeals, ShoppingListItems, LogEntries
- ✅ React frontend with mobile-first responsive design
- ✅ System-preference dark/light mode (automatic switching)
- ✅ Auth structure ready for email/password implementation
- ✅ Health check API endpoint
- ✅ Frontend API service structure

### Planned Features (to be built incrementally)
- 🔲 User authentication (email/password)
- 🔲 OAuth integration (Google, GitHub, etc.)
- 🔲 User profile management
- 🔲 Macro target configuration
- 🔲 Weekly meal plan generation
- 🔲 Meal plan customization
- 🔲 Shopping list generation
- 🔲 Shopping list management
- 🔲 Macro tracking dashboard
- 🔲 Progress visualization

## Development Notes

### Dark Mode Implementation
The frontend uses CSS `@media (prefers-color-scheme: dark)` to automatically switch between light and dark themes based on the user's system preference. No manual toggle is currently implemented - it relies entirely on the OS/browser setting.

### Mobile-First Design
All CSS follows a mobile-first approach, with breakpoints at:
- 480px (small mobile)
- 768px (tablet)
- 1024px (desktop)

### Database Schema
The schema is designed to be extensible:
- UUID primary keys for distributed system compatibility
- Foreign key constraints with CASCADE delete for data integrity
- Automated timestamp triggers for updated_at fields
- Check constraints for enum-like fields (goals, meal types)
- Indexed columns for query performance
- JSONB fields for flexible data storage (dietary preferences, recipe ingredients/tags)
- Migration system using node-pg-migrate for schema evolution

See `database/SCHEMA_RELATIONSHIPS.md` for detailed documentation of table relationships and shopping list auto-update logic.

### Authentication Structure
The auth structure is prepared for:
- Email/password authentication (bcryptjs for hashing)
- JWT token-based sessions
- Middleware for protected routes
- Easy OAuth integration later (Google, GitHub, etc.)

## Environment Variables

### Backend (.env)
- `PORT` - Server port (default: 5000)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT token signing
- `NODE_ENV` - Environment (development/production)

### Migration Commands
```bash
cd backend
npm run migrate          # Run pending migrations
npm run migrate:down     # Rollback last migration
npm run migrate:create   # Create new migration file
```

## Next Steps

This is a foundational setup. In future sessions, you can extend the application feature by feature:

1. **Authentication** - Implement user registration and login
2. **User Profiles** - Add profile management and goal setting
3. **Macro Configuration** - Allow users to set their macro targets
4. **Meal Plan Generation** - Build the meal plan generation algorithm
5. **Shopping Lists** - Implement shopping list creation and management
6. **Macro Tracking** - Add daily macro tracking features
7. **Progress Visualization** - Build charts and progress tracking

## License

ISC

# Role and Objective
Act as a Senior Software Architect and Full-Stack Developer specialized in B2B SaaS applications. We are building "Crevia Sales OS," a specialized sales operations platform for a creative agency named Crevia.

Your goal is to scaffold the project structure, define the core logic, and prepare the development roadmap based on the specific operational flow described below.

# Operational Context
The system manages a hybrid sales team with a weekly schedule:
- **Mon/Wed (Field):** Sales agents visit companies physically along optimized routes in Istanbul.
- **Tue/Thu (Remote):** Agents make phone calls from home/office.
- **Fri (HR/Admin):** Recruitment and administrative tasks (System needs to support admin dashboard).

# Core Features to Implement

## 1. Lead Intelligence Engine (The "Hunter" Module)
- **Scraping & Discovery:** Scan specified districts in Istanbul for businesses.
- **Qualification Logic (The "Need Score"):**
  - Check Google Business Profile: Is it claimed? Is it updated?
  - Check Instagram: Frequency of posts, quality of content (basic heuristic).
  - **Scoring:**
    - High Score: Business exists but has outdated social media/Google maps (Needs Crevia).
    - Low Score: Already works with a pro agency (active, high-quality posts).

## 2. Route & Task Optimization
- **Geo-Clustering:** Group high-score leads by proximity.
- **Route Generation:** Create logical daily routes for Mon/Wed field days (e.g., "Start at Point A, End at Point B, visit these 12 firms").
- **Call Lists:** Generate prioritized call lists for Tue/Thu.

## 3. Team Management & Conflict Resolution
- **Assignment Logic:** Distribute leads to agents.
- **Collision Avoidance:** Ensure no two agents are assigned the same company at the same time. If Agent A is visiting Firm X, Firm X must be locked for Agent B.
- **Scalability:** System must handle adding new agents dynamically and re-shuffling unassigned leads.

# Required Deliverables & File Structure

Please initialize the project and create the following specific documentation and folder structure immediately:

1.  **`CLAUDE.md`**: Create a comprehensive memory file for this project. It must include:
    - Project Goal (Crevia Sales OS).
    - Tech Stack (Suggest: Next.js 14 (App Router), Supabase/Postgres, Tailwind CSS, Python/Node.js for Scraping microservices).
    - Coding Standards (Type-safety, Component modularity).
    - Important Commands (Dev, Build, Test).

2.  **`project-details.md`**: detailed requirements specification. Break down the features into:
    - Phase 1: Data Gathering (Scrapers & APIs).
    - Phase 2: Scoring Algorithm & Database Schema.
    - Phase 3: UI/UX (Dashboard, Map View, Mobile View for Agents).
    - Phase 4: Route Optimization Logic.

3.  **`skills/` Directory**:
    - Create a folder named `skills`.
    - Inside, create `lead_scoring.md`: Describe the heuristic logic for grading a lead.
    - Create `route_planning.md`: Describe how we will handle GeoJSON data and route optimization (e.g., using Mapbox or Google Routes API).

4.  **`agent/` Directory**:
    - Create a folder named `agent`.
    - Inside, create `persona.md`: Define the different user roles (Admin, Field Agent, Telesales Agent) and their permissions.

# Immediate Action Plan
1.  Analyze the operational requirements above.
2.  Generate the requested markdown files (`CLAUDE.md`, `project-details.md`) and the folder structures (`skills/`, `agent/`) with their content.
3.  Wait for my Architecture Config file (which I will provide next) before writing the actual application code.

**Constraint:** Do not assume any specific scraping library yet, but design the interface `ILeadSource` to be agnostic (able to switch between Puppeteer, Apify, or Google Places API).
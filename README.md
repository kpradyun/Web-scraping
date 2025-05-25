# UoH Alumni Portal Scraper

A web scraper for the University of Hyderabad (UoH) alumni portal built with Node.js, Express, and Puppeteer.

![Project Screenshot](/images/scraper-screenshot.png)

## Features

- Secure login automation using headless browser
- Multi-level data extraction (Categories → Subcategories → Alumni profiles)
- CSV export capability
- REST API endpoints for data access
- Error handling with screenshot debugging
- CSV data persistence between sessions

## Technologies Used

- Node.js
- Express.js
- Puppeteer (Headless Chrome)
- JSON2CSV
- CSV-Parse

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/uoh-alumni-scraper.git
cd uoh-alumni-scraper
```

2. Install dependencies:
```bash
npm install
```

3. Add your UoH alumni credentials in `.env`:
```env
UOH_EMAIL=your@email.com
UOH_PASSWORD=your_password
```

## Usage

1. Start the server:
```bash
npm start
```

2. Access the following endpoints:
- **Scrape Data**: `GET http://localhost:3000/api/scrape`
- **Get Alumni Data**: `GET http://localhost:3000/api/alumni`

3. First run will create `uoh_alumni_data.csv` with scraped data

## API Reference

### Scrape Alumni Data
```http
GET /api/scrape
```
- Returns existing data if available, otherwise initiates new scrape
- Response:
  ```json
  {
    "success": boolean,
    "data": Alumni[] | string
  }
  ```

### Get Alumni Data
```http
GET /api/alumni
```
- Returns validated alumni data from CSV
- Response:
  ```json
  {
    "success": boolean,
    "data": Alumni[] | string
  }
  ```

## Screenshots

Add your screenshots to an `images` folder in your repository and update these links:

![CSV Output](/images/csv-screenshot.png)  
*Generated CSV File*

## Security Note

⚠️ **Important**: This implementation currently stores credentials in the codebase. For production use:
1. Move credentials to environment variables
2. Add `.env` to `.gitignore`
3. Use proper authentication middleware

## Disclaimer

This project is for educational purposes only. Use responsibly and respect:
- Website terms of service
- robots.txt rules
- Rate limiting guidelines
- Personal data privacy regulations

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Acknowledgements

- University of Hyderabad Alumni Portal
- Puppeteer team for amazing browser automation tools
- Open source community for valuable libraries

---

**Note:** Replace all image paths with your actual screenshot paths and update the repository URLs with your actual GitHub repository information.

📧 Contact: kpradyun18@gmail.com

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { Parser } = require('json2csv');

const app = express();
const PORT = process.env.PORT || 3000;

// UoH Alumni Portal credentials
const UOH_ALUMNI_URL = 'https://alumni.uohyd.ac.in/members';
const UOH_EMAIL = 'kpradyun18@gmail.com';
const UOH_PASSWORD = 'Keerthi@1809';

app.use(express.json());
app.use(express.static(__dirname));

// Create initial empty file if it doesn't exist
if (!fs.existsSync('uoh_alumni_data.csv')) {
  fs.writeFileSync('uoh_alumni_data.csv', 'name,source,degree,company,gradYear\n');
  console.log('Created initial empty alumni data file');
}

// Enable CORS if needed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/api/scrape', async (req, res) => {
  try {
    // Check for existing valid data with proper validation
    if (fs.existsSync('uoh_alumni_data.csv')) {
      const data = fs.readFileSync('uoh_alumni_data.csv', 'utf8');
      if (data.trim().length > 38) { // Check if more than just header exists
        const jsonData = csvToJSON(data);

        // More robust validation
        const validData = jsonData.filter(entry =>
          entry.name &&
          !['unknown', 'n/a', ''].includes(entry.name.toLowerCase().trim()) &&
          Object.values(entry).some(val => val && val.trim() !== '')
        );

        if (validData.length > 0) {
          console.log(`Returning existing data with ${validData.length} records`);
          return res.json({ success: true, data: validData });
        }
      }
    }

    // Only scrape if no valid data exists
    console.log('Starting scrape operation for UoH alumni...');
    const alumniData = await scrapeAlumniData();

    const csvData = convertToCSV(alumniData);
    fs.writeFileSync('uoh_alumni_data.csv', csvData);

    console.log(`Successfully scraped ${alumniData.length} alumni records`);
    res.json({ success: true, data: alumniData });
  } catch (error) {
    console.error('Error during scraping:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/alumni', (req, res) => {
  try {
    if (fs.existsSync('uoh_alumni_data.csv')) {
      const data = fs.readFileSync('uoh_alumni_data.csv', 'utf8');
      const jsonData = csvToJSON(data);

      // Filter out any placeholder or invalid entries
      const validData = jsonData.filter(entry =>
        entry.name &&
        entry.name !== 'Unknown' &&
        entry.name !== 'n/a' &&
        entry.name.toLowerCase() !== 'n/a'
      );

      if (validData.length > 0) {
        res.json({ success: true, data: validData });
      } else {
        res.json({ success: false, message: 'No valid alumni data available. Run scraper first.' });
      }
    } else {
      res.json({ success: false, message: 'No alumni data available. Run scraper first.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function scrapeAlumniData() {
  console.log('Launching browser for UoH alumni portal scraping...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true, // Switch to false for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60000 // Increased browser launch timeout
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36');

    // Add error handling for page resources
    page.on('error', err => {
      console.error('Page error:', err);
    });

    page.on('pageerror', err => {
      console.error('Page error:', err);
    });

    // Set default navigation timeout
    page.setDefaultNavigationTimeout(60000); // 60 seconds
    page.setDefaultTimeout(45000); // 45 seconds for other operations

    // Navigate to the login page
    console.log(`Navigating to ${UOH_ALUMNI_URL}...`);
    await page.goto(UOH_ALUMNI_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    }).then(() => {
      console.log('Website Reached');
    });

    // Login process with better error handling
    try {
      console.log('Waiting for email field...');
      await page.waitForSelector("#email");
      await page.type('#email', UOH_EMAIL, { delay: 100 });
      await new Promise(r => setTimeout(r, 1000));

      console.log('Clicking email button...');
      await page.click('#emailBtn');

      console.log('Waiting for password field...');
      await new Promise(r => setTimeout(r, 3000));
      await page.waitForSelector('#passwordLogin');
      await page.type('#passwordLogin', UOH_PASSWORD);

      // Click login button
      const loginButtonSelector = '#inside-ui-view > ui-view > main > div.mdl-grid.login-size.contact-div-change.main-family > div > div > div.mdl-cell.mdl-cell--12-col-tablet.login-top-div.login-signup-padding.flexbox.mdl-cell--7-col.login-border > div > form > div:nth-child(4) > button.mdl-button.font-14.ladda-button.ladda-button-primary.mdl-js-button.mdl-button--raised.mdl-button--colored.mdl-typography--font-regular';

      console.log('Waiting for login button...');
      await page.waitForSelector(loginButtonSelector);

      console.log('Clicking login button...');
      await Promise.all([
        page.click(loginButtonSelector),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
      ]);

      console.log('Successfully logged in');
    } catch (loginError) {
      console.error('Login failed:', loginError);
      throw new Error('Failed to log in to alumni portal: ' + loginError.message);
    }

    // Initialize array to store all alumni data
    const alumniData = [];

    // Wait for the main category cards to load with retry
    const categorySelector = '[ng-click*="select_in_level"]';
    try {
      console.log('Waiting for categories to load...');
      await waitForSelectorWithRetry(page, categorySelector, 3);
      const totalCategories = (await page.$$(categorySelector)).length;
      console.log(`Found ${totalCategories} main categories`);

      // Process each category (e.g., Schools)
      // Using Math.min to limit to available categories or 10 as in your example
      const categoriesToProcess = Math.min(totalCategories, 10);

      for (let i = 0; i < categoriesToProcess; i++) {
        try {
          // Re-select elements to avoid stale references
          await waitForSelectorWithRetry(page, categorySelector, 3);
          const categories = await page.$$(categorySelector);

          if (i >= categories.length) {
            console.warn(`Category index ${i} out of bounds. Only ${categories.length} categories available.`);
            continue;
          }

          const category = categories[i];

          // Get category name
          const categoryName = await category.$eval('span', el => el.textContent.trim());
          console.log(`Clicking on category: ${categoryName}`);

          // Click on the category
          await Promise.all([
            category.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(e => console.log('Navigation after category click may have failed:', e.message))
          ]);

          // Wait for subcategories to load
          const subCategorySelector = '[ng-click*="count_obj2.key"]';
          try {
            await waitForSelectorWithRetry(page, subCategorySelector, 3);
            const totalSubCategories = (await page.$$(subCategorySelector)).length;

            console.log(`Found ${totalSubCategories} subcategories in ${categoryName}`);

            // Process each subcategory
            for (let j = 0; j < totalSubCategories; j++) {
              try {
                // Re-select subcategories to avoid stale references
                await waitForSelectorWithRetry(page, subCategorySelector, 3);
                const subCategories = await page.$$(subCategorySelector);

                if (j >= subCategories.length) {
                  console.warn(`Subcategory index ${j} out of bounds. Only ${subCategories.length} subcategories available.`);
                  continue;
                }

                const subCategory = subCategories[j];

                // Get subcategory name
                const subCategoryName = await subCategory.$eval('span', el => el.textContent.trim());
                console.log(`Clicking on subcategory: ${subCategoryName}`);

                // Click on the subcategory
                await Promise.all([
                  subCategory.click(),
                  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(e => console.log('Navigation after subcategory click may have failed:', e.message))
                ]);

                // Wait for member cards to load with a longer timeout
                const memberCardSelector = '.maximize-width.border-box.padding-12';
                try {
                  console.log(`Waiting for alumni cards in ${subCategoryName}...`);

                  // Try alternative selectors if the main one fails
                  let memberCards = [];
                  try {
                    await waitForSelectorWithRetry(page, memberCardSelector, 3, 15000);
                    memberCards = await page.$$(memberCardSelector);
                  } catch (selectorError) {
                    console.log(`Could not find primary selector ${memberCardSelector}, trying alternatives...`);

                    // Try alternative selectors
                    const alternativeSelectors = [
                      '.member-card',
                      '.alumni-card',
                      '.user-card',
                      '.profile-card',
                      'div[class*="member"]',
                      'div[class*="alumni"]',
                      'div[class*="profile"]'
                    ];

                    for (const altSelector of alternativeSelectors) {
                      try {
                        await page.waitForSelector(altSelector, { timeout: 10000 });
                        memberCards = await page.$$(altSelector);
                        console.log(`Found ${memberCards.length} alumni using alternative selector: ${altSelector}`);
                        break;
                      } catch (altError) {
                        // Continue to next alternative
                      }
                    }
                  }

                  // If we still don't have any cards, take a screenshot to debug
                  if (memberCards.length === 0) {
                    console.log('No alumni cards found, taking screenshot for debugging...');
                    await page.screenshot({ path: `debug_${categoryName}_${subCategoryName}.png` });
                    console.log('Debug screenshot saved');
                  } else {
                    console.log(`Found ${memberCards.length} alumni in ${subCategoryName}`);
                  }

                  // Process each member card
                  for (const card of memberCards) {
                    try {
                      // Extract member name - try different selectors
                      let name = 'Unknown';
                      try {
                        name = await card.$eval('a.link-detail', el => el.textContent.trim());
                      } catch (nameError) {
                        try {
                          name = await card.$eval('a', el => el.textContent.trim());
                        } catch (altNameError) {
                          try {
                            name = await card.$eval('h3, h4, h5, div.name, span.name', el => el.textContent.trim());
                          } catch (e) {
                            // Keep as unknown if all selectors fail
                          }
                        }
                      }

                      // Extract location (with fallback if not available)
                      let location = 'Unknown';
                      try {
                        location = await card.$eval('div.overflow-ellipsis', el => el.textContent.trim());
                      } catch (locationError) {
                        try {
                          location = await card.$eval('div[class*="location"], span[class*="location"]', el => el.textContent.trim());
                        } catch (e) {
                          // Keep as unknown if all selectors fail
                        }
                      }

                      // Extract additional details if available
                      let gradYear = 'Unknown';

                      // Try to extract graduation year from text
                      const yearMatch = location.match(/\b(19|20)\d{2}\b/);
                      if (yearMatch) {
                        gradYear = yearMatch[0];
                      }

                      // Add the alumni to our data
                      alumniData.push({
                        name,
                        source: categoryName,
                        degree: subCategoryName, // Using subcategory as degree
                        company: location, // Using location as company for now
                        gradYear
                      });

                      console.log(`Saved: ${name}, ${location}, ${categoryName}`);
                    } catch (cardError) {
                      console.error(`Error processing an alumni card: ${cardError.message}`);
                    }
                  }
                } catch (cardsError) {
                  console.error(`Error finding alumni cards in ${subCategoryName}: ${cardsError.message}`);
                  await page.screenshot({ path: `error_${categoryName}_${subCategoryName}.png` });
                  console.log('Error screenshot saved');
                }

                // Go back to subcategories page
                console.log('Going back to subcategories page...');
                await new Promise(r => setTimeout(r, 2000));
                await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => {
                  console.log('Page.goBack failed:', e.message);
                  // Try to navigate directly back if goBack fails
                  return page.goto(page.url(), { waitUntil: 'networkidle2', timeout: 45000 });
                });
              } catch (subCategoryError) {
                console.error(`Error processing subcategory ${j}: ${subCategoryError.message}`);
                // Try to recover by going back or refreshing
                try {
                  await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
                } catch (e) {
                  console.log('Recovery navigation failed, trying refresh...');
                  await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
                }
              }
            }

            // Go back to main categories page
            console.log('Going back to main categories page...');
            await new Promise(r => setTimeout(r, 2000));
            await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => {
              console.log('Page.goBack failed:', e.message);
              // Try to navigate directly back if goBack fails
              return page.goto(UOH_ALUMNI_URL, { waitUntil: 'networkidle2', timeout: 45000 });
            });
          } catch (subCategoriesError) {
            console.error(`Error finding subcategories in ${categoryName}: ${subCategoriesError.message}`);
            // Try to recover by going back or refreshing
            try {
              await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
            } catch (e) {
              console.log('Recovery navigation failed, trying refresh...');
              await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
            }
          }
        } catch (categoryError) {
          console.error(`Error processing category ${i}: ${categoryError.message}`);
          // Try to recover for next iteration
          try {
            await page.goto(UOH_ALUMNI_URL, { waitUntil: 'networkidle2', timeout: 45000 });
          } catch (e) {
            console.log('Recovery navigation failed, trying refresh...');
            await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
          }
        }
      }
    } catch (categoriesError) {
      console.error(`Error finding main categories: ${categoriesError.message}`);
      throw categoriesError;
    }

    return alumniData;
  } catch (error) {
    console.error('Error during alumni data scraping:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Helper function to wait for a selector with retry logic
async function waitForSelectorWithRetry(page, selector, maxRetries = 3, timeout = 30000) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await page.waitForSelector(selector, { timeout });
      return; // Selector found, exit function
    } catch (error) {
      retries++;
      console.log(`Attempt ${retries}/${maxRetries} failed for selector "${selector}": ${error.message}`);

      if (retries >= maxRetries) {
        console.error(`All ${maxRetries} attempts to find "${selector}" failed`);

        // Take screenshot for debugging on final retry
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          await page.screenshot({ path: `selector_error_${timestamp}.png` });
          console.log(`Debug screenshot saved as selector_error_${timestamp}.png`);

          // Try to get page HTML for debugging
          const html = await page.content();
          fs.writeFileSync(`page_html_${timestamp}.html`, html);
          console.log(`Page HTML saved as page_html_${timestamp}.html`);
        } catch (screenshotError) {
          console.error('Failed to save debug screenshot:', screenshotError);
        }

        throw error; // Re-throw the original error
      }

      // Wait before retrying
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function convertToCSV(data) {
  try {
    const parser = new Parser({
      fields: ['name', 'source', 'degree', 'company', 'gradYear'],
      header: true,
      quote: '"',
      escapedQuote: '"',
      delimiter: ','
    });
    return parser.parse(data);
  } catch (error) {
    console.error('Error converting to CSV:', error);
    throw error;
  }
}

const { parse } = require('csv-parse/sync');

function csvToJSON(csv) {
  try {
    return parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      onRecord: (record) => {
        // Clean up fields
        return Object.fromEntries(
          Object.entries(record).map(([key, value]) => 
            [key, value.trim() || 'Unknown']
          )
        );}
    });
  } catch (error) {
    console.error('CSV parsing error:', error);
    return [];
  }
}

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`Visit the site at http://localhost:${PORT}`);
  console.log(`Access the alumni data at http://localhost:${PORT}/api/alumni`);
  console.log('Make sure to run the scraper first to generate the alumni data.');
  console.log('Scraping may take some time depending on the number of alumni.');
  console.log('Check the console for progress updates.');
  console.log('If you encounter any issues, please check the logs for errors.');
  console.log('Thank you for using the UoH Alumni Scraper!');
  console.log('Happy scraping!');
});
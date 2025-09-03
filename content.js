// Function to parse time string (HH:MM format)
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Function to calculate delay in minutes
function calculateDelay(cancelledArrival, nextArrival) {
  const cancelledMinutes = parseTime(cancelledArrival);
  const nextMinutes = parseTime(nextArrival);
  
  let delay = nextMinutes - cancelledMinutes;
  
  // Handle day boundary (if next arrival is on the next day)
  if (delay < 0) {
    delay += 24 * 60;
  }
  
  return delay;
}

// Function to extract time from text
function extractTime(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

// Function to find and process cancelled rides
function processCancelledRides() {
  // Find all journey containers
  const allJourneys = document.querySelectorAll('[class*="st-journey"]');
  
  allJourneys.forEach((journey, index) => {
    // Check if this journey is cancelled
    const isCancelled = journey.classList.contains('st-journey--is-canceled') || 
                       journey.textContent.includes('Inställd');
    
    if (isCancelled) {
      // Skip if button already exists
      if (journey.querySelector('.delay-compensation-btn')) {
        return;
      }
      
      // Extract cancelled departure time and calculate arrival
      const journeyText = journey.textContent;
      
      // Look for departure time first
      let departureTimeMatch = journeyText.match(/Avg\u00e5r:\s*(\d{2}:\d{2})/);
      
      // Also check for standalone time pattern (like "13:14")
      if (!departureTimeMatch) {
        departureTimeMatch = journeyText.match(/\b(\d{2}:\d{2})\b/);
      }
      
      if (!departureTimeMatch) {
        console.log('Could not find departure time for cancelled journey:', journeyText);
        return;
      }
      
      const departureTime = departureTimeMatch[1];
      
      // Calculate arrival time as departure + 13 minutes
      const [hours, minutes] = departureTime.split(':').map(Number);
      const departureMinutes = hours * 60 + minutes;
      const arrivalMinutes = departureMinutes + 13;
      
      // Handle day boundary
      const arrivalHours = Math.floor((arrivalMinutes % (24 * 60)) / 60);
      const arrivalMins = arrivalMinutes % 60;
      const cancelledArrival = `${arrivalHours.toString().padStart(2, '0')}:${arrivalMins.toString().padStart(2, '0')}`;
      
      // Find the next non-cancelled journey
      let nextJourney = null;
      let nextTime = null;
      
      for (let i = index + 1; i < allJourneys.length; i++) {
        const nextJourneyCandidate = allJourneys[i];
        const isNextCancelled = nextJourneyCandidate.classList.contains('st-journey--is-canceled') || 
                                nextJourneyCandidate.textContent.includes('Inställd');
        
        if (!isNextCancelled) {
          const nextJourneyText = nextJourneyCandidate.textContent;
          // Try multiple patterns to find the time in next journey
          let nextTimeMatch = nextJourneyText.match(/Ankom(?:mer)?:\s*(\d{2}:\d{2})/);
          if (!nextTimeMatch) {
            nextTimeMatch = nextJourneyText.match(/Avgår:\s*(\d{2}:\d{2})/);
          }
          if (!nextTimeMatch) {
            // Look for standalone time pattern
            nextTimeMatch = nextJourneyText.match(/\b(\d{2}:\d{2})\b/);
          }
          
          if (nextTimeMatch) {
            nextJourney = nextJourneyCandidate;
            nextTime = nextTimeMatch[1];
            break;
          }
        }
      }
      
      if (!nextTime) {
        console.log('No next non-cancelled journey found with valid time');
        return;
      }
      
      // Calculate delay
      const delay = calculateDelay(cancelledArrival, nextTime);
      console.log(`Cancelled departure: ${departureTime}, Calculated arrival: ${cancelledArrival}, Next time: ${nextTime}, Delay: ${delay} minutes`);
      
      // Add button if delay is 20 minutes or more
      if (delay >= 20) {
        addDelayButton(journey, delay);
      }
    }
  });
}

// Function to add delay compensation button
function addDelayButton(journeyElement, delayMinutes) {
  const button = document.createElement('button');
  button.className = 'delay-compensation-btn';
  button.textContent = `Ersättning (${delayMinutes} min försening)`;
  button.title = `Klicka för att ansöka om ersättning för ${delayMinutes} minuters försening`;
  
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // TODO: Add button behavior
  });
  
  // Find a good place to insert the button
  // Try to add it to the journey container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'delay-button-container';
  buttonContainer.appendChild(button);
  
  // Insert at the end of the journey element
  journeyElement.appendChild(buttonContainer);
}

// Run the script when the page loads
function init() {
  // Process rides immediately
  processCancelledRides();
  
  // Set up a MutationObserver to handle dynamic content
  const observer = new MutationObserver((mutations) => {
    // Check if any journey elements were added or modified
    const hasJourneyChanges = mutations.some(mutation => {
      return Array.from(mutation.addedNodes).some(node => {
        return node.nodeType === 1 && (
          node.matches?.('[class*="st-journey"]') ||
          node.querySelector?.('[class*="st-journey"]')
        );
      });
    });
    
    if (hasJourneyChanges) {
      processCancelledRides();
    }
  });
  
  // Start observing the document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

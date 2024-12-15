// Establish a WebSocket connection to the server
const socket = new WebSocket(`ws://${window.location.host}/ws`);

// Listen for messages from the server
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "voteUpdate") {
    onIncomingVote(data);
  } else if (data.type === "newPoll") {
    onNewPollAdded(data.poll);
  }
});

// Handle user votes
function onVoteClicked(event) {
  event.preventDefault(); // Prevent form submission
  const formData = new FormData(event.target);

  const pollId = formData.get("poll-id");
  const selectedOption = event.submitter.value;

  // Send the vote to the server via WebSocket
  socket.send(
    JSON.stringify({
      pollId,
      selectedOption,
    })
  );
}

// Handle incoming votes and update the UI dynamically
function onIncomingVote({ pollId, options }) {
  const pollContainer = document.getElementById(pollId);
  if (pollContainer) {
    options.forEach((option) => {
      const optionElement = pollContainer.querySelector(
        `#${pollId}_${option.answer}`
      );
      if (optionElement) {
        optionElement.textContent = `${option.answer}: ${option.votes} votes`;
      }
    });
  }
}

// Attach event listeners to each poll form
document.querySelectorAll(".poll-form").forEach((pollForm) => {
  pollForm.addEventListener("submit", onVoteClicked);
});

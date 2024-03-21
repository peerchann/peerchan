
let deleteMode = '';
const messageTextarea = document.getElementById('postForm')?.querySelector('#message');
function generateRandomPost() {
  fetch('/generateRandomPost', {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.text();
  })
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error('There was a problem with your fetch operation:', error);
  });
}
function deleteAllPosts() {
  fetch('/deleteAllPosts', {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.text();
  })
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error('There was a problem with your fetch operation:', error);
  });
}
function deletePost() {
  deleteMode = deleteMode !== 'post' ? 'post' : '';
  document.documentElement.style.cursor = deleteMode ? 'crosshair' : 'default';

  // Toggle the 'deletion-mode' class on post elements
  const posts = document.querySelectorAll('.post, .post_reply');
  posts.forEach(post => {
      post.classList.toggle('deletion-mode', deleteMode === 'post');
  });

  // Attach click event listener to document body to exit deletion mode on next click
  if (deleteMode) {
    document.documentElement.addEventListener('click', exitDeletionModeOnce);
  }
}
function deleteFile() {
  deleteMode = deleteMode !== 'file' ? 'file' : '';
  document.documentElement.style.cursor = deleteMode ? 'crosshair' : 'default';

  // Toggle the 'deletion-mode' class on embedded file elements
  const embeddedFiles = document.querySelectorAll('.embedded-file');
  embeddedFiles.forEach(file => {
    file.classList.toggle('deletion-mode', deleteMode === 'file');
  });

  // Attach click event listener to document body to exit deletion mode on next click
  if (deleteMode) {
    document.documentElement.addEventListener('click', exitDeletionModeOnce);
  }
}
function exitDeletionModeOnce(event) {
  // Prevent immediate exiting if clicking the delete image button
  if (event.target.tagName !== 'BUTTON') {
    deleteMode = '';
    document.documentElement.style.cursor = 'default';

    // Toggle the 'deletion-mode' class off all embedded file elements
    const embeddedFiles = document.querySelectorAll('.embedded-file');
    embeddedFiles.forEach(file => {
      file.classList.remove('deletion-mode');
    });

    // Toggle the 'deletion-mode' class off all post elements
    const allPosts = document.querySelectorAll('.post, .post_reply');
    allPosts.forEach(post => {
      post.classList.remove('deletion-mode');
    });

    // Remove the click event listener from the document body after a brief delay
    setTimeout(() => {
      document.body.removeEventListener('click', exitDeletionModeOnce);
    }, 100);
  }
}
function expandImage(img) {
  img.classList.toggle('expanded');
}
function handleFileClick(hash) {
  if (deleteMode === 'file') {
    window.location.href = `/deletefile=${hash}`;
  }
}
function handlePostClick(currentBoard, hash) {
  if (deleteMode === 'post') {
    window.location.href = `/${currentBoard}/deletepost=${hash}`
  }
}
function handleHashClick(hash) {
  if (messageTextarea) {
      messageTextarea.value += '>>' + hash + '\n';
  }
}
function changeTheme() {
  const themeSelector = document.getElementById('cssThemeSelector');
  window.location.href = '/function/changeTheme/' + themeSelector.options[themeSelector.selectedIndex].value;
}
document.querySelectorAll('.post-hash').forEach(thisOne => {
  thisOne.classList.add('post-hash-clickable');
})


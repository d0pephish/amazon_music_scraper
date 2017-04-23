# PhantomJS Amazon Music Scraper

Once upon a time I wanted to import multiple amazon music library accounts into a single Plex server. I discovered there was no Linux-based amazon client for syncing music, so I wrote a phantom JS script to import the data.

To bypass the logging in mess (and risk of hard-coding creds), I just configured it to take the cookie info of a logged-in user as input. So you need to log in with a browser and copy your cookie into the script (i know, only marginally better than hard-coded creds. whatevs). 

**As it would turn out, if you have a need to import Amazon Music in linux, you can actually just connect to the cloud drive for your amazon account and all of your music is there to copy down locally.**

Even though this code is a hard way of doing what turned out to be a simple problem, maybe my reversing of the web API will help someone in their own project. 

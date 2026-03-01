const Playlist = require('../models/Playlist');

// @route   POST /api/playlists
// @desc    Create a new playlist
// @access  Private
const createPlaylist = async (req, res) => {
    try {
        const { name, description, isPublic } = req.body;
        const userId = req.user.id;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Playlist name is required' });
        }

        const playlist = await Playlist.create({
            name,
            description,
            isPublic: isPublic || false,
            createdBy: userId,
            videos: []
        });

        res.status(201).json({ success: true, message: 'Playlist created', data: playlist });
    } catch (error) {
        console.error('createPlaylist error:', error);
        res.status(500).json({ success: false, message: 'Error creating playlist' });
    }
};

// @route   GET /api/playlists
// @desc    Get all playlists for the current user
// @access  Private
const getUserPlaylists = async (req, res) => {
    try {
        const userId = req.user.id;
        const playlists = await Playlist.find({ createdBy: userId })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, message: 'Playlists retrieved', data: playlists });
    } catch (error) {
        console.error('getUserPlaylists error:', error);
        res.status(500).json({ success: false, message: 'Error retrieving playlists' });
    }
};

// @route   GET /api/playlists/:id
// @desc    Get a specific playlist by ID (with populated videos)
// @access  Private
const getPlaylistById = async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;

        const playlist = await Playlist.findById(playlistId).populate({
            path: 'videos',
            select: 'title thumbnailUrl rank views uploadDate status'
        });

        if (!playlist) {
            return res.status(404).json({ success: false, message: 'Playlist not found' });
        }

        // Check auth (must be creator or public)
        if (playlist.createdBy.toString() !== userId && !playlist.isPublic) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view this playlist' });
        }

        res.status(200).json({ success: true, message: 'Playlist retrieved', data: playlist });
    } catch (error) {
        console.error('getPlaylistById error:', error);
        res.status(500).json({ success: false, message: 'Error retrieving playlist' });
    }
};

// @route   POST /api/playlists/:id/add
// @desc    Add a video to a playlist
// @access  Private
const addVideoToPlaylist = async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;
        const { videoId } = req.body;

        if (!videoId) return res.status(400).json({ success: false, message: 'Video ID required' });

        const playlist = await Playlist.findOne({ _id: playlistId, createdBy: userId });
        if (!playlist) return res.status(404).json({ success: false, message: 'Playlist not found or unauthorized' });

        // Prevent duplicates
        if (playlist.videos.includes(videoId)) {
            return res.status(400).json({ success: false, message: 'Video already in playlist' });
        }

        playlist.videos.push(videoId);
        await playlist.save();

        res.status(200).json({ success: true, message: 'Video added', data: playlist });
    } catch (error) {
        console.error('addVideoToPlaylist error:', error);
        res.status(500).json({ success: false, message: 'Error adding video' });
    }
};

// @route   DELETE /api/playlists/:id/remove/:videoId
// @desc    Remove a video from a playlist
// @access  Private
const removeVideoFromPlaylist = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id, videoId } = req.params;

        const playlist = await Playlist.findOne({ _id: id, createdBy: userId });
        if (!playlist) return res.status(404).json({ success: false, message: 'Playlist not found or unauthorized' });

        playlist.videos = playlist.videos.filter(v => v.toString() !== videoId);
        await playlist.save();

        res.status(200).json({ success: true, message: 'Video removed', data: playlist });
    } catch (error) {
        console.error('removeVideoFromPlaylist error:', error);
        res.status(500).json({ success: false, message: 'Error removing video' });
    }
};

// @route   PUT /api/playlists/:id/reorder
// @desc    Update the full video array for drag-and-drop reordering
// @access  Private
const reorderPlaylist = async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;
        const { videoIds } = req.body;

        if (!Array.isArray(videoIds)) return res.status(400).json({ success: false, message: 'An array of video IDs is required' });

        const playlist = await Playlist.findOne({ _id: playlistId, createdBy: userId });
        if (!playlist) return res.status(404).json({ success: false, message: 'Playlist not found or unauthorized' });

        playlist.videos = videoIds;
        await playlist.save();

        res.status(200).json({ success: true, message: 'Playlist reordered', data: playlist });
    } catch (error) {
        console.error('reorderPlaylist error:', error);
        res.status(500).json({ success: false, message: 'Error reordering playlist' });
    }
};

// @route   DELETE /api/playlists/:id
// @desc    Delete entire playlist
// @access  Private
const deletePlaylist = async (req, res) => {
    try {
        const userId = req.user.id;
        const playlistId = req.params.id;

        const deleted = await Playlist.findOneAndDelete({ _id: playlistId, createdBy: userId });
        if (!deleted) return res.status(404).json({ success: false, message: 'Playlist not found or unauthorized' });

        res.status(200).json({ success: true, message: 'Playlist deleted' });
    } catch (error) {
        console.error('deletePlaylist error:', error);
        res.status(500).json({ success: false, message: 'Error deleting playlist' });
    }
};

module.exports = {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    reorderPlaylist,
    deletePlaylist
};

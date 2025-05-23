from flask import Blueprint

# Define the blueprint
api_bp = Blueprint('api', __name__)

# Import routes after blueprint definition to avoid circular imports
from . import routes 
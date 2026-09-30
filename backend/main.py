"""Friend-only location API for Oopsie Poopsie.

Firebase Auth authenticates the user; this service verifies that token and
checks accepted friendships before returning a location marker.
"""

import json
import os
from datetime import datetime, timezone
from typing import Annotated

import firebase_admin
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth, credentials, firestore
from pydantic import BaseModel, Field


def initialise_firebase() -> None:
    if firebase_admin._apps:
        return

    service_account_json = os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT_JSON"
    )

    service_account_path = os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT"
    )

    if service_account_json:
        try:
            service_account_info = json.loads(
                service_account_json
            )

            firebase_admin.initialize_app(
                credentials.Certificate(
                    service_account_info
                )
            )

        except Exception as exc:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."
            ) from exc

    elif service_account_path:
        firebase_admin.initialize_app(
            credentials.Certificate(
                service_account_path
            )
        )

    else:
        # Supports Google Application Default Credentials
        # in managed hosting.
        firebase_admin.initialize_app()


initialise_firebase()

db = firestore.client()


default_origins = (
    "http://localhost:5500,"
    "http://127.0.0.1:5500,"
    "http://localhost:5501,"
    "http://127.0.0.1:5501"
)

origins = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        default_origins
    ).split(",")
    if origin.strip()
]


app = FastAPI(
    title="Oopsie Poopsie Location API"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "OPTIONS"
    ],
    allow_headers=[
        "Authorization",
        "Content-Type"
    ],
)


class LocationInput(BaseModel):
    latitude: float = Field(
        ge=-90,
        le=90
    )

    longitude: float = Field(
        ge=-180,
        le=180
    )


async def current_user(
    request: Request
) -> str:
    authorization = request.headers.get(
        "Authorization",
        ""
    )

    if not authorization.startswith(
        "Bearer "
    ):
        raise HTTPException(
            status_code=401,
            detail="Missing Firebase bearer token"
        )

    token = authorization[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing Firebase bearer token"
        )

    try:
        decoded = auth.verify_id_token(
            token
        )

    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid Firebase token"
        ) from exc

    return decoded["uid"]


UserId = Annotated[
    str,
    Depends(current_user)
]


def accepted_friend_ids(
    user_id: str
) -> set[str]:
    sent = (
        db.collection(
            "friendships"
        )
        .where(
            "user1",
            "==",
            user_id
        )
        .stream()
    )

    received = (
        db.collection(
            "friendships"
        )
        .where(
            "user2",
            "==",
            user_id
        )
        .stream()
    )

    friend_ids: set[str] = set()

    for snapshot in (
        *sent,
        *received
    ):
        friendship = snapshot.to_dict() or {}

        if (
            friendship.get(
                "status"
            ) != "accepted"
        ):
            continue

        user1 = friendship.get(
            "user1"
        )

        user2 = friendship.get(
            "user2"
        )

        if not user1 or not user2:
            continue

        friend_ids.add(
            user2
            if user1 == user_id
            else user1
        )

    return friend_ids


def location_payload(
    user_id: str
) -> dict | None:
    location_snapshot = (
        db.collection(
            "shared_locations"
        )
        .document(user_id)
        .get()
    )

    if not location_snapshot.exists:
        return None

    location = location_snapshot.to_dict() or {}

    updated_at = location.get(
            "updatedAt"
        )

    if not updated_at:
        return None

    if isinstance(
        updated_at,
        datetime
    ):
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(
                tzinfo=timezone.utc
            )

        age_seconds = (
            datetime.now(
                timezone.utc
            ) - updated_at
        ).total_seconds()

        if age_seconds > 900:
            return None

    profile_snapshot = (
        db.collection(
            "users"
        )
        .document(user_id)
        .get()
    )

    profile = (
        profile_snapshot.to_dict()
        if profile_snapshot.exists
        else {}
    )

    latitude = location.get(
        "latitude"
    )

    longitude = location.get(
        "longitude"
    )

    if latitude is None or longitude is None:
        return None

    return {
        "uid": user_id,
        "name": profile.get(
            "name",
            "Friend"
        ),
        "username": profile.get(
            "username",
            ""
        ),
        "profilePictureURL": profile.get(
            "profilePictureURL",
            ""
        ),
        "latitude": latitude,
        "longitude": longitude
    }


@app.get("/")
async def root() -> dict:
    return {
        "service": "Oopsie Poopsie Location API",
        "status": "ok"
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok"
    }


@app.post("/api/location")
async def share_location(
    location: LocationInput,
    user_id: UserId
) -> dict:
    db.collection(
        "shared_locations"
    ).document(
        user_id
    ).set(
        {
            "latitude":
                location.latitude,
            "longitude":
                location.longitude,
            "updatedAt":
                firestore.SERVER_TIMESTAMP
        }
    )

    return {
        "shared": True,
        "expiresInSeconds": 900
    }


@app.get(
    "/api/location/friends"
)
async def friend_locations(
    user_id: UserId
) -> list[dict]:
    return [
        payload
        for friend_id in
        accepted_friend_ids(
            user_id
        )
        if (
            payload :=
            location_payload(
                friend_id
            )
        )
    ]


@app.get(
    "/api/location/friends/{friend_id}"
)
async def one_friend_location(
    friend_id: str,
    user_id: UserId
) -> dict:
    if (
        friend_id not in
        accepted_friend_ids(
            user_id
        )
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Location is visible "
                "to accepted friends only"
            )
        )

    location = location_payload(
            friend_id
        )

    if not location:
        raise HTTPException(
            status_code=404,
            detail=(
                "Friend is not sharing "
                "a recent location"
            )
        )

    return location
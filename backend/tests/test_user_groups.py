import pytest
from app.features.user_groups.service import (
    add_member,
    create_group,
    delete_group,
    list_groups,
    remove_member,
    update_group,
)
from app.models import (
    ClaimPolicy,
    PackageStatus,
    Project,
    Role,
    TaskPackage,
    TaskPackageGroup,
    User,
)
from app.schemas import UserGroupCreate, UserGroupMemberCreate, UserGroupUpdate
from fastapi import HTTPException


def make_user(db, username: str, role: Role = Role.DEVELOPER_ADMIN) -> User:
    user = User(
        username=username,
        display_name=username,
        password_hash="x",
        role=role,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    return user


def test_group_members_can_be_created_updated_and_removed(db):
    actor = make_user(db, "admin")
    member = make_user(db, "annotator", Role.ANNOTATOR)
    db.commit()

    group = create_group(UserGroupCreate(name="OLA 组", description="内部人员"), actor, db)
    assert group.member_count == 0

    group = add_member(group.id, UserGroupMemberCreate(user_id=member.id), actor, db)
    assert [listed.id for listed in group.members] == [member.id]
    assert list_groups(db)[0].member_count == 1

    group = update_group(
        group.id,
        UserGroupUpdate(name="OLA 内部组", description="正式内部人员"),
        actor,
        db,
    )
    assert group.name == "OLA 内部组"
    assert group.description == "正式内部人员"

    group = remove_member(group.id, member.id, actor, db)
    assert group.member_count == 0

    delete_group(group.id, actor, db)
    assert list_groups(db) == []


def test_group_rejects_duplicate_members_and_non_empty_deletion(db):
    actor = make_user(db, "admin")
    member = make_user(db, "reviewer", Role.REVIEWER)
    db.commit()

    group = create_group(UserGroupCreate(name="外包 A 组"), actor, db)
    add_member(group.id, UserGroupMemberCreate(user_id=member.id), actor, db)
    with pytest.raises(HTTPException, match="已在该群组"):
        add_member(group.id, UserGroupMemberCreate(user_id=member.id), actor, db)
    with pytest.raises(HTTPException, match="先移除群组成员"):
        delete_group(group.id, actor, db)


def test_group_rejects_inactive_members(db):
    actor = make_user(db, "admin")
    inactive = make_user(db, "inactive", Role.ANNOTATOR)
    inactive.is_active = False
    db.commit()

    group = create_group(UserGroupCreate(name="外包 B 组"), actor, db)
    with pytest.raises(HTTPException, match="停用账号"):
        add_member(group.id, UserGroupMemberCreate(user_id=inactive.id), actor, db)


def test_group_cannot_be_deleted_while_authorized_on_a_package(db):
    actor = make_user(db, "admin")
    project = Project(name="Project", created_by_id=actor.id)
    db.add(project)
    db.flush()
    package = TaskPackage(
        project_id=project.id,
        dataset_id="dataset-id",
        title="Package",
        status=PackageStatus.DRAFT,
        claim_policy=ClaimPolicy.SEQUENTIAL,
        created_by_id=actor.id,
    )
    group = create_group(UserGroupCreate(name="Referenced group"), actor, db)
    db.add(package)
    db.flush()
    db.add(TaskPackageGroup(package_id=package.id, group_id=group.id))
    db.commit()

    with pytest.raises(HTTPException, match="从任务包移除"):
        delete_group(group.id, actor, db)
